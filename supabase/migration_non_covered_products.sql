-- 비급여 현황의 상품명 목록. 한 번 쓴 상품명을 매번 입력하지 않고 고르고, 나중에
-- 추가/이름 수정/삭제할 수 있게 별도 테이블로 둔다. 이미 등록된 구매 기록은 상품명을
-- 글자 그대로 갖고 있어서, 여기서 이름을 바꾸거나 지워도 과거 기록은 그대로 남는다.
create table if not exists non_covered_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table non_covered_products enable row level security;

drop policy if exists "authenticated can read non_covered_products" on non_covered_products;
create policy "authenticated can read non_covered_products" on non_covered_products
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert non_covered_products" on non_covered_products;
create policy "authenticated can insert non_covered_products" on non_covered_products
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update non_covered_products" on non_covered_products;
create policy "authenticated can update non_covered_products" on non_covered_products
  for update using (auth.role() = 'authenticated');

drop policy if exists "authenticated can delete non_covered_products" on non_covered_products;
create policy "authenticated can delete non_covered_products" on non_covered_products
  for delete using (auth.role() = 'authenticated');

insert into non_covered_products (name, sort_order) values
  ('일반한약', 1),
  ('녹용보약', 2),
  ('녹용경옥고', 3),
  ('경옥고', 4),
  ('녹용2배공진단', 5),
  ('원방녹용2배공진단', 6),
  ('사향녹용2배공진단', 7),
  ('녹용관절고', 8),
  ('린다이어트', 9),
  ('린데일리', 10)
on conflict (name) do nothing;
