-- 한약 처방전(조제 지시서) 새 기능 — herb_compounding_orders 표를 만든다.
-- 전제: migration_rls_approved_only.sql이 먼저 적용되어 public.is_approved_staff()가 있어야 한다.
-- 여러 번 실행해도 안전하다.

create table if not exists herb_compounding_orders (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  chart_no text,
  order_date date not null,
  packet_count numeric not null check (packet_count > 0),
  herbs jsonb not null default '[]'::jsonb,
  memo text,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table herb_compounding_orders enable row level security;

drop policy if exists "authenticated can read herb_compounding_orders" on herb_compounding_orders;
create policy "authenticated can read herb_compounding_orders" on herb_compounding_orders
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert herb_compounding_orders" on herb_compounding_orders;
create policy "authenticated can insert herb_compounding_orders" on herb_compounding_orders
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update herb_compounding_orders" on herb_compounding_orders;
create policy "authenticated can update herb_compounding_orders" on herb_compounding_orders
  for update to authenticated using (public.is_approved_staff()) with check (public.is_approved_staff());

drop policy if exists "authenticated can delete herb_compounding_orders" on herb_compounding_orders;
create policy "authenticated can delete herb_compounding_orders" on herb_compounding_orders
  for delete to authenticated using (public.is_approved_staff());

revoke all on herb_compounding_orders from anon;
