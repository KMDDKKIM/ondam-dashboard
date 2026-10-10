-- 처방집 약재 한자 병기(2026-10-10): 약재 이름 목록(herb_names)에 한글 이름과 한자 이름을 같이 넣는다.
-- "當歸" 로 찾아도, "당귀" 로 찾아도 같은 처방이 나오게 한다. 약재 항목의 hanja 칸(herbs[].hanja)이 한자 이름이다.
-- migration_herb_formulas_v2.sql 이 먼저 적용되어 있어야 한다. 여러 번 실행해도 안전하다.

create or replace function public.herb_formulas_sync_names() returns trigger
language plpgsql
as $$
begin
  new.herb_names := coalesce(
    array(
      select distinct trim(n)
      from jsonb_array_elements(coalesce(new.herbs, '[]'::jsonb)) as e,
           lateral unnest(array[e->>'herbName', e->>'hanja']) as n
      where trim(coalesce(n, '')) <> ''
    ),
    '{}'
  );
  return new;
end;
$$;

-- 이미 들어 있는 처방도 다시 만든다(트리거는 herbs 가 SET 에 있으면 돈다).
update herb_formulas set herbs = herbs;
