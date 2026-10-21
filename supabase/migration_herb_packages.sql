-- 한약 패키지(3개월=90일분, 1개월=30일분 선결제) 잔여 일수 + 원장 전용 케어 보드 환자 목록 — 2026-10-21 원장 요청.
-- 비급여 결제(한약)를 등록할 때 패키지를 자동으로 만들고, 처방전이 나갈 때마다 며칠분을 차감한다(잔액은 저장하지 않고 계산한다).
-- 새로 결제하는 환자부터 적용한다(기존 환자는 만들지 않는다).

create table if not exists herb_packages (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  chart_no text,
  total_days integer not null check (total_days > 0),
  -- 결제일: 이 날짜 이후에 출력한 처방전부터 차감한다
  start_date date not null,
  purchase_id uuid unique references non_covered_purchases(id) on delete cascade,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists herb_packages_chart_idx on herb_packages (chart_no);
create index if not exists herb_packages_name_idx on herb_packages (patient_name);

alter table herb_packages enable row level security;

drop policy if exists "authenticated can read herb_packages" on herb_packages;
create policy "authenticated can read herb_packages" on herb_packages
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert herb_packages" on herb_packages;
create policy "authenticated can insert herb_packages" on herb_packages
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update herb_packages" on herb_packages;
create policy "authenticated can update herb_packages" on herb_packages
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can delete herb_packages" on herb_packages;
create policy "authenticated can delete herb_packages" on herb_packages
  for delete to authenticated using (public.is_approved_staff());

-- 케어 보드(원장 전용)에 원장이 직접 등록한 환자 — 원장만 읽고 쓴다.
create table if not exists care_board_patients (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  chart_no text,
  memo text,
  created_at timestamptz not null default now()
);

alter table care_board_patients enable row level security;

drop policy if exists "owner can read care_board_patients" on care_board_patients;
create policy "owner can read care_board_patients" on care_board_patients
  for select to authenticated using (public.is_owner());

drop policy if exists "owner can insert care_board_patients" on care_board_patients;
create policy "owner can insert care_board_patients" on care_board_patients
  for insert to authenticated with check (public.is_owner());

drop policy if exists "owner can update care_board_patients" on care_board_patients;
create policy "owner can update care_board_patients" on care_board_patients
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner can delete care_board_patients" on care_board_patients;
create policy "owner can delete care_board_patients" on care_board_patients
  for delete to authenticated using (public.is_owner());
