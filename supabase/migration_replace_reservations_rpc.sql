-- 예약 명단 대체를 한 트랜잭션으로.
-- 예약시트를 붙여넣어 저장하면 그 날짜의 기존 예약을 지우고 새로 넣는데, 예전 코드는
-- delete 와 insert 를 별개 요청으로 보내서 중간에 실패하면 그 날짜의 명단이 통째로
-- 사라질 수 있었다. 이 함수는 (1) 그 날짜의 daily_records 행을 만들거나 그대로 두고
-- (기존 upsert 와 같은 동작), (2) 그 행의 reservations 를 지우고, (3) 넘겨받은 행을 넣는다 — 전부 한 번에.
--
-- daily_records / reservations 는 예약관리 앱 소유 테이블이다. 이 함수는 테이블 구조나
-- 정책을 바꾸지 않고, 이 앱이 지금 쓰던 컬럼(아래 insert 목록)에만 쓴다. 통계 컬럼
-- (visit_count 등)은 함수 밖(서버 코드)에서 예전처럼 갱신한다.
--
-- p_rows: [{ "doctor_name": "...", "time_label": "...", "patient_name": "...", "chart_no": "...",
--            "phone": "...", "mobile": "...", "visit_status": "...", "treatment_area": "...",
--            "treatment": "...", "special_notes": "...", "memo": "..." }, ...]  (빈 배열이면 명단만 비운다)
-- 반환: 그 날짜의 daily_records.id
--
-- 재실행해도 안전하다(create or replace + revoke/grant).
create or replace function public.replace_reservations(p_date date, p_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_date is null then
    raise exception 'p_date is required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a json array';
  end if;

  -- 행을 잠가서 같은 날짜를 동시에 대체하는 요청이 순서대로 처리되게 한다.
  insert into public.daily_records (date)
  values (p_date)
  on conflict (date) do update set date = excluded.date
  returning id into v_id;

  delete from public.reservations where daily_record_id = v_id;

  insert into public.reservations (
    daily_record_id, doctor_name, time_label, patient_name, chart_no, phone, mobile,
    visit_status, treatment_area, treatment, special_notes, memo
  )
  select
    v_id,
    coalesce(r->>'doctor_name', ''),
    coalesce(r->>'time_label', ''),
    coalesce(r->>'patient_name', ''),
    coalesce(r->>'chart_no', ''),
    coalesce(r->>'phone', ''),
    coalesce(r->>'mobile', ''),
    coalesce(r->>'visit_status', ''),
    coalesce(r->>'treatment_area', ''),
    coalesce(r->>'treatment', ''),
    coalesce(r->>'special_notes', ''),
    coalesce(r->>'memo', '')
  from jsonb_array_elements(p_rows) as r;

  return v_id;
end;
$$;

revoke all on function public.replace_reservations(date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_reservations(date, jsonb) to service_role;
