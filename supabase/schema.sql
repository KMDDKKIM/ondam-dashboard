create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

alter table staff enable row level security;

-- Every logged-in user can see the staff list (used to render names in the UI).
-- This is safe: anon (not-logged-in) requests are rejected by auth.role() != 'authenticated',
-- and there is no public anon-key-only access path in this app (unlike dest-auto, this
-- app has real Supabase Auth sessions, so RLS scoped to `authenticated` is the correct,
-- standard pattern — not a shortcut).
create policy "authenticated can read staff" on staff
  for select using (auth.role() = 'authenticated');

-- Users can only edit their own row (e.g. changing their own display name later).
-- Row creation is NOT exposed here — the two initial owner accounts are seeded once,
-- out-of-band, via the Supabase Auth Admin API (see the plan's Prerequisites section).
create policy "users can update own staff row" on staff
  for update using (auth.uid() = id);

-- RLS alone isn't enough here: the UPDATE policy's USING clause is reused as
-- the CHECK clause when none is given, so it permits changing ANY column of
-- the caller's own row, including role -- letting a staff member promote
-- themselves to owner. Column-level grants close that: staff can rename
-- themselves, nothing else.
revoke update on staff from authenticated;
grant update (name) on staff to authenticated;

-- Happy call: 초진환자 해피콜
create table if not exists happy_call_patients (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  doctor_staff_id uuid references staff(id),
  patient_type text not null check (patient_type in ('건보', '자보', '비급여')),
  acupuncture_package_success text check (acupuncture_package_success in ('성공', '실패')),
  first_visit_date date not null,
  revisit_1 date,
  revisit_2 date,
  revisit_3 date,
  jabo_herb_1 date,
  jabo_herb_2 date,
  jabo_herb_3 date,
  next_visit_note text,
  call_log text,
  memo text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table happy_call_patients enable row level security;

drop policy if exists "authenticated can read happy_call_patients" on happy_call_patients;
create policy "authenticated can read happy_call_patients" on happy_call_patients
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert happy_call_patients" on happy_call_patients;
create policy "authenticated can insert happy_call_patients" on happy_call_patients
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update happy_call_patients" on happy_call_patients;
create policy "authenticated can update happy_call_patients" on happy_call_patients
  for update using (auth.role() = 'authenticated');

-- Happy call: 한약 처방 (해피콜 목록 자동 생성용)
create table if not exists herb_medicine_prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  pickup_date date not null,
  duration_days smallint not null,
  call_date_1 date not null,
  call_date_2 date not null,
  call_date_3 date not null,
  call_1_done boolean not null default false,
  call_2_done boolean not null default false,
  call_3_done boolean not null default false,
  call_1_note text,
  call_2_note text,
  call_3_note text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table herb_medicine_prescriptions enable row level security;

drop policy if exists "authenticated can read herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can read herb_medicine_prescriptions" on herb_medicine_prescriptions
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can insert herb_medicine_prescriptions" on herb_medicine_prescriptions
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can update herb_medicine_prescriptions" on herb_medicine_prescriptions
  for update using (auth.role() = 'authenticated');

-- Happy call: 린다이어트 패키지 (해피콜 목록 자동 생성용)
create table if not exists diet_packages (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  detox_start_date date not null,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table diet_packages enable row level security;

drop policy if exists "authenticated can read diet_packages" on diet_packages;
create policy "authenticated can read diet_packages" on diet_packages
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert diet_packages" on diet_packages;
create policy "authenticated can insert diet_packages" on diet_packages
  for insert with check (auth.role() = 'authenticated');

create table if not exists diet_package_calls (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references diet_packages(id) on delete cascade,
  call_date date not null,
  done boolean not null default false,
  note text,
  unique (package_id, call_date)
);

alter table diet_package_calls enable row level security;

drop policy if exists "authenticated can read diet_package_calls" on diet_package_calls;
create policy "authenticated can read diet_package_calls" on diet_package_calls
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert diet_package_calls" on diet_package_calls;
create policy "authenticated can insert diet_package_calls" on diet_package_calls
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update diet_package_calls" on diet_package_calls;
create policy "authenticated can update diet_package_calls" on diet_package_calls
  for update using (auth.role() = 'authenticated');

-- Happy call: 해피콜 목록 — 초진 수동 추가분
create table if not exists happy_call_manual_entries (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  note text,
  call_date date not null,
  done boolean not null default false,
  done_note text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table happy_call_manual_entries enable row level security;

drop policy if exists "authenticated can read happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can read happy_call_manual_entries" on happy_call_manual_entries
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can update happy_call_manual_entries" on happy_call_manual_entries
  for update using (auth.role() = 'authenticated');
