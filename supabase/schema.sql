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

-- 직원 등급: 대표원장 / 부원장 / 팀장 / 사원.
-- staff.role(관리 권한 owner/staff)은 그대로 두고 등급을 별도 컬럼으로 둔다.
-- 순서가 중요하다: 컬럼 추가 → 대표원장 백필 → 제약 추가. 백필 전에 제약을
-- 걸면 기존 원장(role = 'owner') 행이 기본값 '사원'이라 제약에 걸려 실패한다.
alter table staff add column if not exists grade text not null default '사원'
  check (grade in ('대표원장', '부원장', '팀장', '사원'));

update staff set grade = '대표원장' where role = 'owner' and grade <> '대표원장';

-- 관리 권한(role)과 등급이 어긋나는 행을 DB가 거부한다:
-- 대표원장일 때만 role = 'owner'.
alter table staff drop constraint if exists staff_grade_matches_role;
alter table staff add constraint staff_grade_matches_role
  check ((role = 'owner') = (grade = '대표원장'));

alter table staff enable row level security;

-- Helper: is the caller an approved staff member? Every data policy below uses it
-- instead of the loose `auth.role() = 'authenticated'`: a signed-up but pending
-- account is still an 'authenticated' Supabase user and could otherwise read
-- patient data with the public anon key. SECURITY DEFINER so it can read staff
-- regardless of the staff RLS policy (no recursion: the function bypasses RLS).
create or replace function public.is_approved_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff where id = auth.uid() and status = 'approved'
  )
$$;

revoke all on function public.is_approved_staff() from public, anon;
grant execute on function public.is_approved_staff() to authenticated;

-- Approved staff can see the staff list (used to render names in the UI). A pending
-- account can still read its OWN row -- the pending-approval gate in
-- src/lib/supabase/middleware.ts needs it -- but not anyone else's.
drop policy if exists "authenticated can read staff" on staff;
create policy "authenticated can read staff" on staff
  for select to authenticated using (auth.uid() = id or public.is_approved_staff());

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
  doctor_staff_id uuid references staff(id) on delete set null,
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
  created_by uuid references staff(id) on delete set null,
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
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert happy_call_patients" on happy_call_patients;
create policy "authenticated can insert happy_call_patients" on happy_call_patients
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update happy_call_patients" on happy_call_patients;
create policy "authenticated can update happy_call_patients" on happy_call_patients
  for update to authenticated using (public.is_approved_staff());

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
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table herb_medicine_prescriptions enable row level security;

drop policy if exists "authenticated can read herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can read herb_medicine_prescriptions" on herb_medicine_prescriptions
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can insert herb_medicine_prescriptions" on herb_medicine_prescriptions
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can update herb_medicine_prescriptions" on herb_medicine_prescriptions
  for update to authenticated using (public.is_approved_staff());

-- Happy call: 린다이어트 패키지 (해피콜 목록 자동 생성용)
create table if not exists diet_packages (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  detox_start_date date not null,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table diet_packages enable row level security;

drop policy if exists "authenticated can read diet_packages" on diet_packages;
create policy "authenticated can read diet_packages" on diet_packages
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert diet_packages" on diet_packages;
create policy "authenticated can insert diet_packages" on diet_packages
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update diet_packages" on diet_packages;
create policy "authenticated can update diet_packages" on diet_packages
  for update to authenticated using (public.is_approved_staff());

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
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert diet_package_calls" on diet_package_calls;
create policy "authenticated can insert diet_package_calls" on diet_package_calls
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update diet_package_calls" on diet_package_calls;
create policy "authenticated can update diet_package_calls" on diet_package_calls
  for update to authenticated using (public.is_approved_staff());

-- Happy call: 해피콜 목록 — 초진 수동 추가분
create table if not exists happy_call_manual_entries (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  note text,
  call_date date not null,
  done boolean not null default false,
  done_note text,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table happy_call_manual_entries enable row level security;

drop policy if exists "authenticated can read happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can read happy_call_manual_entries" on happy_call_manual_entries
  for select to authenticated using (public.is_approved_staff());

-- 한약재 재고 현황: 현재 재고를 한눈에 보고, 다 써서 새 봉지를 뜯을 때 사용량을
-- 입력하면 차감되고, 새로 주문이 오면 입고량을 더한다. low_stock_threshold를
-- 밑돌면 화면에서 부족 표시를 한다 (주문 타이밍을 놓치지 않기 위함).
create table if not exists herb_inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'g',
  current_stock numeric not null default 0,
  low_stock_threshold numeric,
  created_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table herb_inventory enable row level security;

drop policy if exists "authenticated can read herb_inventory" on herb_inventory;
create policy "authenticated can read herb_inventory" on herb_inventory
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert herb_inventory" on herb_inventory;
create policy "authenticated can insert herb_inventory" on herb_inventory
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update herb_inventory" on herb_inventory;
create policy "authenticated can update herb_inventory" on herb_inventory
  for update to authenticated using (public.is_approved_staff());

-- 사용/입고 이력 — 현재고 숫자만으로는 "언제 얼마나 썼는지"가 안 남아서 따로 둔다.
create table if not exists herb_inventory_logs (
  id uuid primary key default gen_random_uuid(),
  herb_id uuid not null references herb_inventory(id) on delete cascade,
  change_type text not null check (change_type in ('use', 'restock')),
  amount numeric not null check (amount > 0),
  note text,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table herb_inventory_logs enable row level security;

drop policy if exists "authenticated can read herb_inventory_logs" on herb_inventory_logs;
create policy "authenticated can read herb_inventory_logs" on herb_inventory_logs
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert herb_inventory_logs" on herb_inventory_logs;
create policy "authenticated can insert herb_inventory_logs" on herb_inventory_logs
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can update happy_call_manual_entries" on happy_call_manual_entries
  for update to authenticated using (public.is_approved_staff());

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
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table non_covered_purchases enable row level security;

drop policy if exists "authenticated can read non_covered_purchases" on non_covered_purchases;
create policy "authenticated can read non_covered_purchases" on non_covered_purchases
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert non_covered_purchases" on non_covered_purchases;
create policy "authenticated can insert non_covered_purchases" on non_covered_purchases
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update non_covered_purchases" on non_covered_purchases;
create policy "authenticated can update non_covered_purchases" on non_covered_purchases
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can delete non_covered_purchases" on non_covered_purchases;
create policy "authenticated can delete non_covered_purchases" on non_covered_purchases
  for delete to authenticated using (public.is_approved_staff());

-- 비급여 구매 후 해피콜 예정일. 등록 시 자동으로 채워지지만(구매일+7일) 필요하면
-- 고쳐 쓸 수 있고, 값이 있으면 happy_call_manual_entries에도 행을 만들어(또는
-- 갱신해) 해피콜 목록/홈 화면 "오늘 할 일"에 그 날짜에 뜨도록 연결한다.
alter table non_covered_purchases add column if not exists happy_call_date date;
alter table non_covered_purchases add column if not exists happy_call_entry_id uuid references happy_call_manual_entries(id);

-- 한약류 비급여 상품(공진단 등)은 "수령일"(happy_call_date를 그 의미로 쓴다) +
-- 처방일수를 넣으면 한약 처방(herb_medicine_prescriptions)과 같은 공식으로
-- 해피콜 3회를 계산해 각각 happy_call_manual_entries에 행을 만든다
-- (computeHerbCallDates: 수령일+1일 / 수령일+처방일수÷2 / 수령일+처방일수-3).
alter table non_covered_purchases add column if not exists duration_days integer;
alter table non_covered_purchases add column if not exists happy_call_entry_id_2 uuid references happy_call_manual_entries(id);
alter table non_covered_purchases add column if not exists happy_call_entry_id_3 uuid references happy_call_manual_entries(id);

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
  updated_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table daily_revenue enable row level security;

drop policy if exists "authenticated can read daily_revenue" on daily_revenue;
create policy "authenticated can read daily_revenue" on daily_revenue
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert daily_revenue" on daily_revenue;
create policy "authenticated can insert daily_revenue" on daily_revenue
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update daily_revenue" on daily_revenue;
create policy "authenticated can update daily_revenue" on daily_revenue
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can delete daily_revenue" on daily_revenue;
create policy "authenticated can delete daily_revenue" on daily_revenue
  for delete to authenticated using (public.is_approved_staff());

-- 월말결산표 붙여넣기로 그 달 총매출을 통째로 덮어쓰는 값. daily_revenue를
-- 날짜별로 지우고 다시 채우는 대신 별도 테이블로 둔 이유: 월말결산표에는 날짜별
-- 내역이 없고 그 달 합계 한 줄뿐이라, 굳이 "월 1일에 몰아서 기록" 같은 억지
-- 날짜를 만들면 나중에 그 날짜로 당일결산을 다시 붙여넣을 때 덮어써져 버린다.
-- getMonthlySummary()는 이 값을 기준일(as_of_date)까지의 누계로 보고, 기준일 이후의
-- daily_revenue를 더해서 그 달 총매출을 만든다 — "월결산을 다시 넣으면 리셋"은
-- 이 테이블 upsert 하나로 끝난다.
create table if not exists monthly_revenue_override (
  month text primary key, -- 'YYYY-MM'
  total_revenue numeric not null,
  updated_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table monthly_revenue_override enable row level security;

drop policy if exists "authenticated can read monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can read monthly_revenue_override" on monthly_revenue_override
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can insert monthly_revenue_override" on monthly_revenue_override
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can update monthly_revenue_override" on monthly_revenue_override
  for update to authenticated using (public.is_approved_staff());

-- 티로 등으로 녹음한 상담 내용을 붙여넣으면 AI가 차팅 형식으로 요약해준다
-- (src/app/api/consult-summary/route.ts, Anthropic API 필요). transcript는
-- 원본 그대로, summary는 AI가 만든(또는 그 뒤 손으로 고친) 결과.
create table if not exists consult_summaries (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  consult_date date not null default current_date,
  transcript text not null,
  summary text not null,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table consult_summaries enable row level security;

drop policy if exists "authenticated can read consult_summaries" on consult_summaries;
create policy "authenticated can read consult_summaries" on consult_summaries
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert consult_summaries" on consult_summaries;
create policy "authenticated can insert consult_summaries" on consult_summaries
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update consult_summaries" on consult_summaries;
create policy "authenticated can update consult_summaries" on consult_summaries
  for update to authenticated using (public.is_approved_staff());

-- 오늘 할 일 — localStorage였던 걸 공유 테이블로 옮겼다. due_date가 지났는데
-- 아직 안 끝났으면(done=false) 계속 "오늘 할 일"에 뜨는 방식으로 자동 이월된다
-- (따로 날짜를 갱신하지 않아도 됨 — src/components/TodoChecklist.tsx의 조회
-- 조건 참고). done_at은 완료 표시를 언제 했는지 남겨서, 그 날짜가 지나면
-- 목록에서 빠지게 한다(완료한 걸 계속 보여주지 않기 위함).
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  due_date date not null default current_date,
  assignee_staff_id uuid references staff(id) on delete set null,
  done boolean not null default false,
  done_at date,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table todos enable row level security;

drop policy if exists "authenticated can read todos" on todos;
create policy "authenticated can read todos" on todos
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert todos" on todos;
create policy "authenticated can insert todos" on todos
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update todos" on todos;
create policy "authenticated can update todos" on todos
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can delete todos" on todos;
create policy "authenticated can delete todos" on todos
  for delete to authenticated using (public.is_approved_staff());

-- 사내 채팅: 토픽방 + 채팅방
create table if not exists chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('topic', 'chat')),
  is_public boolean not null default true,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists chat_room_members (
  room_id uuid not null references chat_rooms(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  last_read_at timestamptz,
  primary key (room_id, staff_id)
);

alter table chat_rooms enable row level security;

-- 공개방은 전체 조회 가능, 비공개방은 멤버이거나 내가 만든 방만 보인다.
-- created_by 조건이 꼭 필요한 이유: 비공개방을 막 만든 시점에는 아직
-- chat_room_members에 내 행이 없을 수 있는데(멤버 추가는 방 생성 직후
-- 별도 insert), 이 조건이 없으면 insert().select()로 방금 만든 방을
-- 못 돌려받는다.
drop policy if exists "authenticated can read visible chat_rooms" on chat_rooms;
create policy "authenticated can read visible chat_rooms" on chat_rooms
  for select to authenticated using (
    exists (select 1 from staff s where s.id = auth.uid() and s.status = 'approved')
    and (
      is_public = true
      or created_by = auth.uid()
      or exists (select 1 from chat_room_members m where m.room_id = chat_rooms.id and m.staff_id = auth.uid())
    )
  );

drop policy if exists "authenticated can create chat_rooms" on chat_rooms;
create policy "authenticated can create chat_rooms" on chat_rooms
  for insert to authenticated with check (
    exists (select 1 from staff s where s.id = auth.uid() and s.status = 'approved')
  );

alter table chat_room_members enable row level security;

-- 본인 행만 조회 가능 — 안읽음 계산 RPC와 last_read_at 갱신 둘 다 본인
-- 행만 있으면 충분하다. 다른 멤버 목록을 보여주는 화면은 이번 범위에 없다.
drop policy if exists "staff can read own chat_room_members row" on chat_room_members;
create policy "staff can read own chat_room_members row" on chat_room_members
  for select to authenticated using (staff_id = auth.uid());

-- insert는 두 경우만 허용: (1) 본인 행(공개방을 처음 열 때의 lazy join,
-- 또는 last_read_at 갱신), (2) 그 방을 만든 사람이 비공개방 생성 시점에
-- 최초 멤버들을 등록하는 경우.
drop policy if exists "staff can insert own or as room creator" on chat_room_members;
create policy "staff can insert own or as room creator" on chat_room_members
  for insert to authenticated with check (
    exists (select 1 from staff s where s.id = auth.uid() and s.status = 'approved')
    and (
      (staff_id = auth.uid() and exists (
        select 1 from chat_rooms r where r.id = chat_room_members.room_id and r.is_public = true
      ))
      or exists (
        select 1 from chat_rooms r where r.id = chat_room_members.room_id and r.created_by = auth.uid()
      )
    )
  );

drop policy if exists "staff can update own last_read_at" on chat_room_members;
create policy "staff can update own last_read_at" on chat_room_members
  for update to authenticated using (staff_id = auth.uid());

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid references staff(id) on delete set null,
  content text,
  created_at timestamptz not null default now()
);

alter table chat_messages enable row level security;

drop policy if exists "members can read chat_messages" on chat_messages;
create policy "members can read chat_messages" on chat_messages
  for select to authenticated using (
    exists (select 1 from staff s where s.id = auth.uid() and s.status = 'approved')
    and exists (
      select 1 from chat_rooms r
      where r.id = chat_messages.room_id
        and (
          r.is_public = true
          or exists (select 1 from chat_room_members m where m.room_id = r.id and m.staff_id = auth.uid())
        )
    )
  );

drop policy if exists "members can insert chat_messages" on chat_messages;
create policy "members can insert chat_messages" on chat_messages
  for insert to authenticated with check (
    exists (select 1 from staff s where s.id = auth.uid() and s.status = 'approved')
    and sender_id = auth.uid()
    and exists (
      select 1 from chat_rooms r
      where r.id = chat_messages.room_id
        and (
          r.is_public = true
          or exists (select 1 from chat_room_members m where m.room_id = r.id and m.staff_id = auth.uid())
        )
    )
  );

create table if not exists chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_type text not null
);

alter table chat_attachments enable row level security;

drop policy if exists "members can read chat_attachments" on chat_attachments;
create policy "members can read chat_attachments" on chat_attachments
  for select to authenticated using (
    exists (select 1 from staff s where s.id = auth.uid() and s.status = 'approved')
    and exists (
      select 1 from chat_messages msg
      join chat_rooms r on r.id = msg.room_id
      where msg.id = chat_attachments.message_id
        and (
          r.is_public = true
          or exists (select 1 from chat_room_members m where m.room_id = r.id and m.staff_id = auth.uid())
        )
    )
  );

drop policy if exists "members can insert chat_attachments" on chat_attachments;
create policy "members can insert chat_attachments" on chat_attachments
  for insert to authenticated with check (
    exists (select 1 from staff s where s.id = auth.uid() and s.status = 'approved')
    and exists (
      select 1 from chat_messages msg
      join chat_rooms r on r.id = msg.room_id
      where msg.id = chat_attachments.message_id
        and msg.sender_id = auth.uid()
        and (
          r.is_public = true
          or exists (select 1 from chat_room_members m where m.room_id = r.id and m.staff_id = auth.uid())
        )
    )
  );

-- 방 목록 + 안읽음 개수를 한 번에 가져오는 함수. SECURITY INVOKER(기본값)라
-- 호출한 사람의 RLS가 그대로 적용된다 — chat_rooms에서 보이는 방만 나오고,
-- chat_room_members 서브쿼리도 "본인 행만" 정책과 맞물려 자연히 내
-- last_read_at만 가져온다. 권한 로직을 함수 안에 따로 중복 작성하지 않는다.
create or replace function list_rooms_with_unread()
returns table (
  room_id uuid,
  name text,
  kind text,
  is_public boolean,
  created_by uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
as $$
  select
    r.id as room_id,
    r.name,
    r.kind,
    r.is_public,
    r.created_by,
    r.created_at,
    (select max(m.created_at) from chat_messages m where m.room_id = r.id) as last_message_at,
    (
      select count(*)
      from chat_messages m
      where m.room_id = r.id
        and m.created_at > coalesce(
          (select rm.last_read_at from chat_room_members rm where rm.room_id = r.id and rm.staff_id = auth.uid()),
          '-infinity'::timestamptz
        )
    )::bigint as unread_count
  from chat_rooms r
  order by coalesce(
    (select max(m2.created_at) from chat_messages m2 where m2.room_id = r.id),
    r.created_at
  ) desc;
$$;

grant execute on function list_rooms_with_unread() to authenticated;

-- Realtime 구독이 실제로 이벤트를 받으려면 테이블을 supabase_realtime
-- publication에 명시적으로 추가해야 한다(기본적으로는 어떤 테이블도 여기
-- 포함되지 않는다) — 이걸 빼먹으면 subscribeToRoomMessages(Task 4)가 아무
-- 에러 없이 그냥 조용히 아무 이벤트도 못 받는다. 이미 publication에
-- 들어있는 상태에서 다시 실행하면 에러가 나므로 존재 여부를 먼저 확인한다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;

-- 첨부파일 저장용 버킷. public으로 둬서 구현을 단순하게 유지한다(자세한
-- 이유는 스펙 §11 참고) — URL 자체가 추측 불가능한 경로라 사실상 비공개지만
-- 메시지 텍스트처럼 RLS로 완전히 막히지는 않는다.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

drop policy if exists "authenticated can upload chat attachments" on storage.objects;
create policy "authenticated can upload chat attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-attachments' and public.is_approved_staff());

drop policy if exists "authenticated can view chat attachments" on storage.objects;
create policy "authenticated can view chat attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-attachments' and public.is_approved_staff());

-- 물품신청
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
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert supply_items" on supply_items;
create policy "authenticated can insert supply_items" on supply_items
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update supply_items" on supply_items;
create policy "authenticated can update supply_items" on supply_items
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can delete supply_items" on supply_items;
create policy "authenticated can delete supply_items" on supply_items
  for delete to authenticated using (public.is_approved_staff());

create table if not exists supply_requests (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_name text not null,
  order_url text,
  memo text not null default '',
  requested_by uuid references staff(id) on delete set null,
  requested_at timestamptz not null default now(),
  ordered_at timestamptz,
  ordered_by uuid references staff(id) on delete set null,
  received_at timestamptz,
  received_by uuid references staff(id) on delete set null
);

alter table supply_requests enable row level security;

drop policy if exists "authenticated can read supply_requests" on supply_requests;
create policy "authenticated can read supply_requests" on supply_requests
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert supply_requests" on supply_requests;
create policy "authenticated can insert supply_requests" on supply_requests
  for insert to authenticated with check (public.is_approved_staff());

-- 도착 체크는 직원 누구나 하므로 update 자체는 로그인 사용자에게 열고,
-- 주문완료 체크(ordered_at/ordered_by)는 아래 트리거가 원장만 바꿀 수 있게 막는다.
drop policy if exists "authenticated can update supply_requests" on supply_requests;
create policy "authenticated can update supply_requests" on supply_requests
  for update to authenticated using (public.is_approved_staff());

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

-- 한약재 삭제
-- 한약재 재고 화면에서 약재를 지울 수 있게 DELETE 정책을 추가한다.
-- (정책이 없으면 Supabase는 에러 없이 0행만 지운다.) 사용/입고 이력은
-- herb_inventory_logs의 on delete cascade로 같이 지워진다.
drop policy if exists "authenticated can delete herb_inventory" on herb_inventory;
create policy "authenticated can delete herb_inventory" on herb_inventory
  for delete to authenticated using (public.is_approved_staff());

-- 결산표 내원환자수/일평균 환자수
-- 일일결산에서 그날 내원환자수를, 월말결산에서 진료일평균환자수를 같이 저장한다.
-- 홈의 "일평균 환자수"를 결산표 기준으로 계산하기 위한 칸이다(월말결산 > 일일결산 누적).
alter table daily_revenue add column if not exists visit_count integer;
alter table monthly_revenue_override add column if not exists avg_daily_visits numeric;

-- 월말결산의 기준일 — 월말결산 값은 이 날짜까지의 누계이고, 그 뒤 일일결산이 더해진다
-- (migration_override_as_of.sql). null이면 예전 방식(월말결산 값만 사용).
alter table monthly_revenue_override add column if not exists as_of_date date;
-- 2026-09 행 기준일 보정(2026-09-19 월말결산 붙여넣기분, 이미 있으면 그대로 둠).
update monthly_revenue_override
   set as_of_date = date '2026-09-19'
 where month = '2026-09'
   and as_of_date is null;

-- 총매출/일평균 환자수 목표
-- 이번달 총매출 목표와 일평균 환자수 목표. 기존 한약/다이어트/특수한약/추나 목표와
-- 같은 monthly_goals 행(월 단위)에 칸을 더한다.
alter table monthly_goals add column if not exists revenue_goal bigint;
alter table monthly_goals add column if not exists avg_visits_goal numeric;

-- 비급여 상품 목록
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
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert non_covered_products" on non_covered_products;
create policy "authenticated can insert non_covered_products" on non_covered_products
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update non_covered_products" on non_covered_products;
create policy "authenticated can update non_covered_products" on non_covered_products
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can delete non_covered_products" on non_covered_products;
create policy "authenticated can delete non_covered_products" on non_covered_products
  for delete to authenticated using (public.is_approved_staff());

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

-- 일일 결산 예약/추나 숫자, 실적 보정
-- 일일 결산 입력에서 함께 저장하는 예약·추나·제외환자 숫자(하루 한 행, 결산표 행에 붙인다)와,
-- 대시보드 한약/다이어트/특수한약/추나 실적을 손으로 고칠 때 쓰는 보정값.
alter table daily_revenue add column if not exists reservation_count integer; -- 오늘 예약 환자수
alter table daily_revenue add column if not exists kept_count integer;        -- 예약 정상 이행
alter table daily_revenue add column if not exists noshow_count integer;      -- 예약 노쇼
alter table daily_revenue add column if not exists cancel_count integer;      -- 예약 취소
alter table daily_revenue add column if not exists next_booking_count integer; -- 다음예약 접수한 환자수
alter table daily_revenue add column if not exists chuna_count integer;       -- 추나 횟수(인원)
alter table daily_revenue add column if not exists excluded_count integer;    -- 제외환자수

-- 자동 집계에 더하거나 빼는 값(예: 한약 -2). 기본 0.
alter table monthly_goals add column if not exists herb_adjust integer not null default 0;
alter table monthly_goals add column if not exists diet_adjust integer not null default 0;
alter table monthly_goals add column if not exists special_herb_adjust integer not null default 0;
alter table monthly_goals add column if not exists chuna_adjust integer not null default 0;

-- 직원 삭제(퇴사/가입 거절) 지원.
-- staff 행을 지워도 그 직원이 남긴 기록(환자·처방·결산·상담요약·채팅·신청 등)은
-- 그대로 두고 "누가 했는지"만 비운다. staff(id)를 가리키는 외래키를 모두
-- on delete set null 로 다시 만든다. (chat_room_members.staff_id 는 on delete
-- cascade 그대로 — 채팅방 참여 정보만 같이 지워진다.)
--
-- 재실행해도 안전하다: 해당 컬럼의 staff 참조 외래키를 이름과 상관없이 찾아
-- 지운 뒤 <table>_<column>_fkey 이름으로 다시 만든다. 아직 없는 테이블은 건너뛴다.
do $$
declare
  targets text[][] := array[
    ['happy_call_patients', 'doctor_staff_id'],
    ['happy_call_patients', 'created_by'],
    ['herb_medicine_prescriptions', 'created_by'],
    ['diet_packages', 'created_by'],
    ['happy_call_manual_entries', 'created_by'],
    ['herb_inventory', 'created_by'],
    ['herb_inventory_logs', 'created_by'],
    ['non_covered_purchases', 'created_by'],
    ['daily_revenue', 'updated_by'],
    ['monthly_revenue_override', 'updated_by'],
    ['consult_summaries', 'created_by'],
    ['todos', 'assignee_staff_id'],
    ['todos', 'created_by'],
    ['chat_rooms', 'created_by'],
    ['chat_messages', 'sender_id'],
    ['supply_requests', 'requested_by'],
    ['supply_requests', 'ordered_by'],
    ['supply_requests', 'received_by']
  ];
  t text;
  c text;
  i int;
  con record;
begin
  for i in 1 .. array_length(targets, 1) loop
    t := targets[i][1];
    c := targets[i][2];
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    -- 이 컬럼에서 staff를 가리키는 기존 외래키(이름이 뭐든)를 모두 제거
    for con in
      select k.conname
      from pg_constraint k
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
      where k.contype = 'f'
        and k.conrelid = ('public.' || t)::regclass
        and k.confrelid = 'public.staff'::regclass
        and a.attname = c
    loop
      execute format('alter table public.%I drop constraint %I', t, con.conname);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.staff(id) on delete set null',
      t, t || '_' || c || '_fkey', c
    );
  end loop;
end
$$;

-- 직원 이름은 로그인 아이디로 쓰이므로 중복을 DB가 막는다(가입 API의 사전 조회와
-- insert 사이에 같은 이름이 끼어드는 경우까지 방어). 이미 같은 이름이 둘 이상
-- 있으면 이 문장이 실패하니 먼저 정리한 뒤 실행한다.
create unique index if not exists staff_name_unique on staff (name);

-- 해피콜 결과 기록: 통화완료 / 부재중 / 거부·연락불가 + 재시도 + 완료자/시각.
-- 모든 문장이 add column if not exists 라서 여러 번 실행해도 안전하다.
--
-- 결과값(result): 'answered'(통화완료), 'no_answer'(1차 부재중 — 콜은 아직 열려 있고
-- 예정일이 다음날로 옮겨진 상태), 'refused'(거부/연락불가), 'unreachable'(두 번째
-- 부재중으로 "연락 안 됨" 종료). attempts 는 지금까지 건 횟수.
-- 완료자(completed_by)는 staff 삭제 시 null 로 비운다(기록은 남긴다).
--
-- 콜을 저장하는 방식(원본 컬럼 재사용):
--  - 한약(herb_medicine_prescriptions): 콜 3개가 한 행에 있어 call_N_* 컬럼을 콜마다 추가.
--    예정일=call_date_N, 종료 여부=call_N_done, 메모=call_N_note 를 그대로 쓴다.
--  - 린다이어트(diet_package_calls): 예정일=call_date, 종료=done, 메모=note.
--  - 수동/비급여(happy_call_manual_entries): 예정일=call_date, 종료=done, 메모=done_note.
--  - 초진(happy_call_patients): 콜 전용 행이 없어(초진일+1일로 계산) 환자 행에
--    call_* 컬럼을 추가한다. 예정일을 바꾸면 call_due_date 에 저장(비어 있으면 초진일+1일).

-- 초진환자
alter table happy_call_patients add column if not exists call_due_date date;
alter table happy_call_patients add column if not exists call_attempts smallint not null default 0;
alter table happy_call_patients add column if not exists call_result text
  check (call_result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table happy_call_patients add column if not exists call_completed_by uuid references staff(id) on delete set null;
alter table happy_call_patients add column if not exists call_completed_at timestamptz;
alter table happy_call_patients add column if not exists call_memo text;

-- 한약 처방 (콜 1~3)
alter table herb_medicine_prescriptions add column if not exists call_1_attempts smallint not null default 0;
alter table herb_medicine_prescriptions add column if not exists call_1_result text
  check (call_1_result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table herb_medicine_prescriptions add column if not exists call_1_completed_by uuid references staff(id) on delete set null;
alter table herb_medicine_prescriptions add column if not exists call_1_completed_at timestamptz;

alter table herb_medicine_prescriptions add column if not exists call_2_attempts smallint not null default 0;
alter table herb_medicine_prescriptions add column if not exists call_2_result text
  check (call_2_result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table herb_medicine_prescriptions add column if not exists call_2_completed_by uuid references staff(id) on delete set null;
alter table herb_medicine_prescriptions add column if not exists call_2_completed_at timestamptz;

alter table herb_medicine_prescriptions add column if not exists call_3_attempts smallint not null default 0;
alter table herb_medicine_prescriptions add column if not exists call_3_result text
  check (call_3_result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table herb_medicine_prescriptions add column if not exists call_3_completed_by uuid references staff(id) on delete set null;
alter table herb_medicine_prescriptions add column if not exists call_3_completed_at timestamptz;

-- 린다이어트 콜
alter table diet_package_calls add column if not exists attempts smallint not null default 0;
alter table diet_package_calls add column if not exists result text
  check (result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table diet_package_calls add column if not exists completed_by uuid references staff(id) on delete set null;
alter table diet_package_calls add column if not exists completed_at timestamptz;

-- 수동/비급여 콜
alter table happy_call_manual_entries add column if not exists attempts smallint not null default 0;
alter table happy_call_manual_entries add column if not exists result text
  check (result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table happy_call_manual_entries add column if not exists completed_by uuid references staff(id) on delete set null;
alter table happy_call_manual_entries add column if not exists completed_at timestamptz;

-- 첫 부재중으로 예정일이 다음날로 옮겨지기 전의 원래 예정일. 첫 부재중을 되돌릴 때
-- 이 날짜로 복원한다(연체 표시 유지, 한약의 call_date_N 을 영구히 바꾸지 않기 위해).
-- 초진은 call_original_due, 한약은 call_N_original_due, 그 외는 original_due.
alter table happy_call_patients add column if not exists call_original_due date;
alter table herb_medicine_prescriptions add column if not exists call_1_original_due date;
alter table herb_medicine_prescriptions add column if not exists call_2_original_due date;
alter table herb_medicine_prescriptions add column if not exists call_3_original_due date;
alter table diet_package_calls add column if not exists original_due date;
alter table happy_call_manual_entries add column if not exists original_due date;

-- 초진환자 등록: 차트번호·연락처·초진/재초진 구분 + 삭제 권한 (migration_happy_call_first_visit.sql)
alter table happy_call_patients add column if not exists chart_no text;
alter table happy_call_patients add column if not exists phone text;
alter table happy_call_patients add column if not exists visit_kind text not null default '초진';

alter table happy_call_patients drop constraint if exists happy_call_patients_visit_kind_check;
alter table happy_call_patients add constraint happy_call_patients_visit_kind_check
  check (visit_kind in ('초진', '재초진'));

drop policy if exists "authenticated can delete happy_call_patients" on happy_call_patients;
create policy "authenticated can delete happy_call_patients" on happy_call_patients
  for delete to authenticated using (public.is_approved_staff());


-- 예약 명단 원자적 대체 (migration_replace_reservations_rpc.sql)
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
