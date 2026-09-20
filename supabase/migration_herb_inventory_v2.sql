-- 한약재 재고 v2: 단위는 봉지 하나만 쓰고, 재고 변경(입고/사용)은 서버 함수 한 번으로
-- 원자적으로 처리한다(브라우저에서 약재별로 읽고-쓰기를 하면 동시에 고칠 때 덮어써지고,
-- 중간에 실패해 다시 시도하면 이중 반영되고, 음수가 조용히 0으로 잘렸다).
-- 이 파일은 여러 번 실행해도 안전하다.

-- 새로 등록하는 약재의 단위 기본값을 봉지로(앱은 단위를 화면에 쓰지 않는다).
alter table herb_inventory alter column unit set default '봉지';

-- apply_herb_stock_changes(p_changes)
--   p_changes: [{ "herb_id": uuid 또는 "name": 약재명, "change_type": "use"|"restock",
--                 "amount": 1 이상 정수, "note": 메모(선택) }, ...]
--   - security invoker: 호출한 직원의 RLS가 그대로 적용된다(승인된 직원만 통과).
--   - 한 트랜잭션에서 모든 변경을 처리하고, 관련 약재 행을 미리 잠근다(for update).
--   - 목록에 없는 약재이거나 결과가 음수가 되는 항목이 하나라도 있으면 전체를 거부한다.
--   - 변경마다 herb_inventory_logs에 기록한다(처리자 = auth.uid()).
--   - 반환: 바뀐 약재들의 결과 재고 [{ "herb_id", "name", "current_stock" }, ...]
create or replace function public.apply_herb_stock_changes(p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_change jsonb;
  v_herb_id uuid;
  v_name text;
  v_type text;
  v_amount_text text;
  v_amount numeric;
  v_note text;
  v_current numeric;
  v_next numeric;
  v_herb_name text;
  v_ids uuid[] := '{}';
  v_result jsonb;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception '반영할 재고 변경 내용이 없습니다.';
  end if;
  if jsonb_array_length(p_changes) > 500 then
    raise exception '한 번에 처리할 수 있는 항목이 너무 많습니다(최대 500개).';
  end if;

  -- 1) 모든 항목을 검증하고 대상 약재 id를 모은다(이름으로 온 항목은 id로 바꾼다).
  for v_change in select * from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(v_change) <> 'object' then
      raise exception '잘못된 재고 변경 형식입니다.';
    end if;
    v_type := v_change->>'change_type';
    if v_type is null or v_type not in ('use', 'restock') then
      raise exception '변경 종류는 use 또는 restock 이어야 합니다.';
    end if;
    v_amount_text := v_change->>'amount';
    v_name := nullif(btrim(coalesce(v_change->>'name', '')), '');
    if v_amount_text is null or v_amount_text !~ '^[0-9]{1,9}$' or v_amount_text::numeric < 1 then
      raise exception '수량은 1 이상의 정수(봉지)여야 합니다: %', coalesce(v_name, v_change->>'herb_id', '?');
    end if;

    if v_change->>'herb_id' is not null then
      begin
        v_herb_id := (v_change->>'herb_id')::uuid;
      exception when invalid_text_representation then
        raise exception '목록에 없는 약재입니다: %', coalesce(v_name, v_change->>'herb_id');
      end;
    elsif v_name is not null then
      select id into v_herb_id from public.herb_inventory where name = v_name;
    else
      raise exception '약재 이름이나 id가 없는 항목이 있습니다.';
    end if;

    if v_herb_id is null or not exists (select 1 from public.herb_inventory where id = v_herb_id) then
      raise exception '목록에 없는 약재입니다: %', coalesce(v_name, v_change->>'herb_id');
    end if;
    v_ids := v_ids || v_herb_id;
  end loop;

  -- 2) 대상 약재 행을 id 순서로 잠근다(동시 실행끼리 교착이 생기지 않게 순서를 고정).
  perform 1
  from public.herb_inventory
  where id = any (v_ids)
  order by id
  for update;

  -- 3) 입력 순서대로 적용한다. 음수가 되는 순간 예외로 전체를 되돌린다.
  for v_change in select * from jsonb_array_elements(p_changes) loop
    v_type := v_change->>'change_type';
    v_amount := (v_change->>'amount')::numeric;
    v_note := nullif(btrim(coalesce(v_change->>'note', '')), '');
    v_name := nullif(btrim(coalesce(v_change->>'name', '')), '');
    if v_change->>'herb_id' is not null then
      v_herb_id := (v_change->>'herb_id')::uuid;
    else
      select id into v_herb_id from public.herb_inventory where name = v_name;
    end if;

    select current_stock, name into v_current, v_herb_name
    from public.herb_inventory where id = v_herb_id;
    if not found then
      raise exception '목록에 없는 약재입니다: %', coalesce(v_name, v_change->>'herb_id');
    end if;

    v_next := case when v_type = 'use' then v_current - v_amount else v_current + v_amount end;
    if v_next < 0 then
      raise exception '재고가 모자라 반영할 수 없습니다: % (현재 %봉지, 사용 %봉지)', v_herb_name, v_current, v_amount;
    end if;

    update public.herb_inventory
       set current_stock = v_next, updated_at = now()
     where id = v_herb_id;

    insert into public.herb_inventory_logs (herb_id, change_type, amount, note, created_by)
    values (v_herb_id, v_type, v_amount, v_note, v_uid);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('herb_id', id, 'name', name, 'current_stock', current_stock)), '[]'::jsonb)
    into v_result
  from public.herb_inventory
  where id = any (v_ids);

  return v_result;
end;
$$;

revoke all on function public.apply_herb_stock_changes(jsonb) from public, anon;
grant execute on function public.apply_herb_stock_changes(jsonb) to authenticated;
