-- 주의: 이 파일의 정책은 나중에 migration_rls_approved_only.sql 로 대체됨. 새 DB가 아니면 다시 실행하지 말 것.
-- 물품신청: 자주 쓰는 품목(supply_items) + 신청 내역(supply_requests).
-- 상태는 컬럼으로 따로 두지 않고 시각으로 판단한다 — received_at이 있으면 도착,
-- ordered_at이 있으면 주문완료, 둘 다 없으면 신청됨.
create table if not exists supply_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  order_url text,
  created_at timestamptz not null default now(),
  unique (category, name)
);

alter table supply_items enable row level security;

drop policy if exists "authenticated can read supply_items" on supply_items;
create policy "authenticated can read supply_items" on supply_items
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert supply_items" on supply_items;
create policy "authenticated can insert supply_items" on supply_items
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update supply_items" on supply_items;
create policy "authenticated can update supply_items" on supply_items
  for update using (auth.role() = 'authenticated');

drop policy if exists "authenticated can delete supply_items" on supply_items;
create policy "authenticated can delete supply_items" on supply_items
  for delete using (auth.role() = 'authenticated');

create table if not exists supply_requests (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_name text not null,
  order_url text,
  memo text not null default '',
  requested_by uuid references staff(id),
  requested_at timestamptz not null default now(),
  ordered_at timestamptz,
  ordered_by uuid references staff(id),
  received_at timestamptz,
  received_by uuid references staff(id)
);

alter table supply_requests enable row level security;

drop policy if exists "authenticated can read supply_requests" on supply_requests;
create policy "authenticated can read supply_requests" on supply_requests
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert supply_requests" on supply_requests;
create policy "authenticated can insert supply_requests" on supply_requests
  for insert with check (auth.role() = 'authenticated');

-- 도착 체크는 직원 누구나 하므로 update 자체는 로그인 사용자에게 열고,
-- 주문완료 체크(ordered_at/ordered_by)는 아래 트리거가 원장만 바꿀 수 있게 막는다.
drop policy if exists "authenticated can update supply_requests" on supply_requests;
create policy "authenticated can update supply_requests" on supply_requests
  for update using (auth.role() = 'authenticated');

-- 삭제: 원장은 전부, 직원은 자기가 신청했고 아직 주문 전인 것만.
drop policy if exists "owner or own pending can delete supply_requests" on supply_requests;
create policy "owner or own pending can delete supply_requests" on supply_requests
  for delete using (
    exists (select 1 from staff s where s.id = auth.uid() and s.role = 'owner')
    or (requested_by = auth.uid() and ordered_at is null)
  );

create or replace function public.supply_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.ordered_at is distinct from old.ordered_at or new.ordered_by is distinct from old.ordered_by)
     and not exists (select 1 from staff where id = auth.uid() and role = 'owner') then
    raise exception '주문 완료 체크는 원장만 할 수 있습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists supply_requests_guard on supply_requests;
create trigger supply_requests_guard
  before update on supply_requests
  for each row execute function public.supply_requests_guard();

-- 수량 칸은 없애고 필요하면 메모에 적는다(이미 만든 테이블에서는 컬럼을 지운다).
alter table supply_requests drop column if exists quantity;
