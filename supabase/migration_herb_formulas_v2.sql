-- 처방집 확장(2026-10-07): 주치(효능) 칸, 약재 이름 목록(포함·제외 약재로 찾기용) 추가.
-- migration_herb_formulas.sql 이 먼저 적용되어 있어야 한다. 여러 번 실행해도 안전하다.
--  - indication: 주치/효능 글(서적의 주치).
--  - herb_names: 이 처방에 든 약재 이름 목록 — herbs 가 바뀔 때마다 자동으로 다시 만든다(트리거).
--    "당귀·천궁이 들어간 처방", "감초가 없는 처방" 같은 검색이 이 칸으로 돈다.

alter table herb_formulas add column if not exists indication text not null default '';
alter table herb_formulas add column if not exists herb_names text[] not null default '{}';

create or replace function public.herb_formulas_sync_names() returns trigger
language plpgsql
as $$
begin
  new.herb_names := coalesce(
    array(
      select distinct trim(e->>'herbName')
      from jsonb_array_elements(coalesce(new.herbs, '[]'::jsonb)) as e
      where trim(coalesce(e->>'herbName', '')) <> ''
    ),
    '{}'
  );
  return new;
end;
$$;

drop trigger if exists herb_formulas_sync_names on herb_formulas;
create trigger herb_formulas_sync_names
  before insert or update of herbs on herb_formulas
  for each row execute function public.herb_formulas_sync_names();

create index if not exists herb_formulas_herb_names_idx on herb_formulas using gin (herb_names);

-- 이미 들어 있는 처방도 약재 이름 목록을 채운다.
update herb_formulas set herbs = herbs;
