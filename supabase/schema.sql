create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

-- 직원 가입신청 승인 흐름: 새 계정은 'pending'으로 시작하고, 원장이 승인해야
-- 'approved'로 바뀐다 (src/lib/supabase/middleware.ts가 pending인 동안 앱 화면
-- 대신 /pending-approval만 보여준다). 기존에 만들어둔 원장 계정처럼 이미 있는
-- 행은 이 컬럼이 없다가 새로 생기면 기본값 'pending'이 붙으므로, 아래에서 한 번
-- role = 'owner' 행만 'approved'로 백필한다.
alter table staff add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved'));
update staff set status = 'approved' where role = 'owner' and status <> 'approved';

alter table staff enable row level security;

-- Every logged-in user can see the staff list (used to render names in the UI).
-- This is safe: anon (not-logged-in) requests are rejected by auth.role() != 'authenticated',
-- and there is no public anon-key-only access path in this app (unlike dest-auto, this
-- app has real Supabase Auth sessions, so RLS scoped to `authenticated` is the correct,
-- standard pattern — not a shortcut).
create policy "authenticated can read staff" on staff
  for select using (auth.role() = 'authenticated');

-- Users can only edit their own row (e.g. changing their own display name later).
-- Row creation is NOT exposed here — the owner account(s) were seeded once via the
-- Supabase Auth Admin API, and every staff signup after that goes through
-- src/app/api/signup/route.ts, which uses the service_role key (bypasses RLS
-- entirely) instead of an INSERT policy, so a not-yet-approved account can never
-- insert its own staff row directly.
create policy "users can update own staff row" on staff
  for update using (auth.uid() = id);

-- RLS alone isn't enough here: the UPDATE policy's USING clause is reused as
-- the CHECK clause when none is given, so it permits changing ANY column of
-- the caller's own row, including role -- letting a staff member promote
-- themselves to owner. Column-level grants close that: staff can rename
-- themselves, nothing else.
revoke update on staff from authenticated;
grant update (name) on staff to authenticated;

-- 이름 기반 로그인: staff.name으로 auth.users.email을 찾아준다. staff 테이블에
-- email을 따로 복제하지 않고 항상 auth.users를 그대로 조회해 계정 생성 시점의
-- 이메일과 어긋날 일이 없다. SECURITY DEFINER로 RLS/anon 제한을 우회하되,
-- 정확히 일치하는 이름 하나의 이메일만 돌려주므로 목록 전체가 새지는 않는다.
create or replace function public.email_for_staff_name(p_name text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from staff s
  join auth.users u on u.id = s.id
  where s.name = p_name
  limit 1
$$;

grant execute on function public.email_for_staff_name(text) to anon, authenticated;

-- Happy call: 초진환자 해피콜
create table if not exists happy_call_patients (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  doctor_staff_id uuid references staff(id),
  patient_type text not null check (patient_type in ('건보', '자보', '비급여')),
  acupuncture_package_success text check (acupuncture_package_success in ('성공', '실패', '비포함')),
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

-- 이미 만들어진 프로젝트엔 위 create table이 no-op이라 제약을 다시 걸어준다.
-- '비포함'(약침 패키지를 아예 권하지 않았거나 환자가 안 한 경우)을 성공/실패와
-- 구분해서 고를 수 있어야 한다.
alter table happy_call_patients drop constraint if exists happy_call_patients_acupuncture_package_success_check;
alter table happy_call_patients add constraint happy_call_patients_acupuncture_package_success_check
  check (acupuncture_package_success in ('성공', '실패', '비포함'));

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

drop policy if exists "authenticated can update diet_packages" on diet_packages;
create policy "authenticated can update diet_packages" on diet_packages
  for update using (auth.role() = 'authenticated');

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

-- 한약재 재고 현황: 현재 재고를 한눈에 보고, 다 써서 새 봉지를 뜯을 때 사용량을
-- 입력하면 차감되고, 새로 주문이 오면 입고량을 더한다. low_stock_threshold를
-- 밑돌면 화면에서 부족 표시를 한다 (주문 타이밍을 놓치지 않기 위함).
create table if not exists herb_inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'g',
  current_stock numeric not null default 0,
  low_stock_threshold numeric,
  created_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table herb_inventory enable row level security;

drop policy if exists "authenticated can read herb_inventory" on herb_inventory;
create policy "authenticated can read herb_inventory" on herb_inventory
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert herb_inventory" on herb_inventory;
create policy "authenticated can insert herb_inventory" on herb_inventory
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update herb_inventory" on herb_inventory;
create policy "authenticated can update herb_inventory" on herb_inventory
  for update using (auth.role() = 'authenticated');

-- 사용/입고 이력 — 현재고 숫자만으로는 "언제 얼마나 썼는지"가 안 남아서 따로 둔다.
create table if not exists herb_inventory_logs (
  id uuid primary key default gen_random_uuid(),
  herb_id uuid not null references herb_inventory(id) on delete cascade,
  change_type text not null check (change_type in ('use', 'restock')),
  amount numeric not null check (amount > 0),
  note text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table herb_inventory_logs enable row level security;

drop policy if exists "authenticated can read herb_inventory_logs" on herb_inventory_logs;
create policy "authenticated can read herb_inventory_logs" on herb_inventory_logs
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert herb_inventory_logs" on herb_inventory_logs;
create policy "authenticated can insert herb_inventory_logs" on herb_inventory_logs
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can update happy_call_manual_entries" on happy_call_manual_entries
  for update using (auth.role() = 'authenticated');

-- 비급여 현황: 환자 이름/차트번호/연락처 + 어떤 상품을 샀는지 + 어느 구분(일반 /
-- 26추석이벤트 / 27설이벤트 ...)인지 한 행에 남긴다. 환자별 별도 테이블을 두지
-- 않고, 같은 환자가 다시 구매하면 이 테이블에서 이름/차트번호/연락처로 검색해
-- 자동완성하는 방식으로 "한 번 입력하면 다음엔 검색해서 클릭"을 구현한다
-- (src/lib/supabase/nonCoveredPurchases.ts의 searchPatients 참고).
create table if not exists non_covered_purchases (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  chart_no text not null,
  phone text,
  category text not null default '일반',
  product_name text not null,
  amount numeric,
  purchase_date date not null default current_date,
  memo text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table non_covered_purchases enable row level security;

drop policy if exists "authenticated can read non_covered_purchases" on non_covered_purchases;
create policy "authenticated can read non_covered_purchases" on non_covered_purchases
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert non_covered_purchases" on non_covered_purchases;
create policy "authenticated can insert non_covered_purchases" on non_covered_purchases
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update non_covered_purchases" on non_covered_purchases;
create policy "authenticated can update non_covered_purchases" on non_covered_purchases
  for update using (auth.role() = 'authenticated');

-- 비급여 구매 후 해피콜 예정일. 등록 시 자동으로 채워지지만(구매일+7일) 필요하면
-- 고쳐 쓸 수 있고, 값이 있으면 happy_call_manual_entries에도 행을 만들어(또는
-- 갱신해) 해피콜 목록/홈 화면 "오늘 할 일"에 그 날짜에 뜨도록 연결한다.
alter table non_covered_purchases add column if not exists happy_call_date date;
alter table non_covered_purchases add column if not exists happy_call_entry_id uuid references happy_call_manual_entries(id);

-- 이 비급여 항목을 이번달 현황의 어느 목표(한약/다이어트/특수한약/추나)에 셀지.
-- null이면 목표에 반영하지 않는다. 특수한약(공진단/경옥고/녹용관절고/보폐고엔오
-- 등)은 예약관리 쪽에 실적 데이터가 없어 이 컬럼이 유일한 소스다(getMonthlySummary
-- 참고).
alter table non_covered_purchases add column if not exists goal_category text
  check (goal_category in ('herb', 'diet', 'special_herb', 'chuna'));

-- 당일결산표 붙여넣기로 매일 채우는 날짜별 매출. daily_records(예약관리 앱 소유,
-- RLS 전체 차단이라 이 앱은 admin 클라이언트로만 접근)와 달리 이 테이블은 이 앱
-- 자신의 데이터라 authenticated RLS로 둔다.
create table if not exists daily_revenue (
  date date primary key,
  total_revenue numeric not null,
  source text not null check (source in ('daily', 'monthly')),
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now()
);

alter table daily_revenue enable row level security;

drop policy if exists "authenticated can read daily_revenue" on daily_revenue;
create policy "authenticated can read daily_revenue" on daily_revenue
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert daily_revenue" on daily_revenue;
create policy "authenticated can insert daily_revenue" on daily_revenue
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update daily_revenue" on daily_revenue;
create policy "authenticated can update daily_revenue" on daily_revenue
  for update using (auth.role() = 'authenticated');

drop policy if exists "authenticated can delete daily_revenue" on daily_revenue;
create policy "authenticated can delete daily_revenue" on daily_revenue
  for delete using (auth.role() = 'authenticated');

-- 월말결산표 붙여넣기로 그 달 총매출을 통째로 덮어쓰는 값. daily_revenue를
-- 날짜별로 지우고 다시 채우는 대신 별도 테이블로 둔 이유: 월말결산표에는 날짜별
-- 내역이 없고 그 달 합계 한 줄뿐이라, 굳이 "월 1일에 몰아서 기록" 같은 억지
-- 날짜를 만들면 나중에 그 날짜로 당일결산을 다시 붙여넣을 때 덮어써져 버린다.
-- getMonthlySummary()는 이 값이 있으면 daily_revenue 합계 대신 이 값을 쓴다 —
-- 그래서 "월결산을 다시 넣으면 리셋"이 이 테이블 upsert 하나로 끝난다.
create table if not exists monthly_revenue_override (
  month text primary key, -- 'YYYY-MM'
  total_revenue numeric not null,
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now()
);

alter table monthly_revenue_override enable row level security;

drop policy if exists "authenticated can read monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can read monthly_revenue_override" on monthly_revenue_override
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can insert monthly_revenue_override" on monthly_revenue_override
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can update monthly_revenue_override" on monthly_revenue_override
  for update using (auth.role() = 'authenticated');

-- 티로 등으로 녹음한 상담 내용을 붙여넣으면 AI가 차팅 형식으로 요약해준다
-- (src/app/api/consult-summary/route.ts, Anthropic API 필요). transcript는
-- 원본 그대로, summary는 AI가 만든(또는 그 뒤 손으로 고친) 결과.
create table if not exists consult_summaries (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  consult_date date not null default current_date,
  transcript text not null,
  summary text not null,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table consult_summaries enable row level security;

drop policy if exists "authenticated can read consult_summaries" on consult_summaries;
create policy "authenticated can read consult_summaries" on consult_summaries
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert consult_summaries" on consult_summaries;
create policy "authenticated can insert consult_summaries" on consult_summaries
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update consult_summaries" on consult_summaries;
create policy "authenticated can update consult_summaries" on consult_summaries
  for update using (auth.role() = 'authenticated');
