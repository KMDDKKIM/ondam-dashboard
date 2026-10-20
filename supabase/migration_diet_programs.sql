-- 린다이어트 프로그램 카드(환자 1명당 1장) + 원장 카톡 보냄 기록 — 2026-10-20 원장 요청.
-- 대면/비대면 린다이어트 해피콜 기준(온유한의원 사례)의 트리거에 필요한 날짜를 모아 둔다.
-- 데스크가 입력하고 원장이 케어 보드(/care-board)에서 "오늘 연락할 분"으로 본다 — 승인된 직원 전원이 읽고 쓴다.

create table if not exists diet_programs (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  chart_no text,
  phone text,
  -- 진료방식: visit = 대면, remote = 비대면
  track text not null default 'visit' check (track in ('visit', 'remote')),
  first_date date,                 -- 초진일(대면) 또는 첫 상담일(비대면)
  weeks integer,                   -- 프로그램 주수
  paid_at date,                    -- 결제 확인일
  shipped_at date,                 -- 발송일(택배)
  detox_start_date date,           -- 디톡스 시작일
  detox_days integer not null default 3,
  medicine_end_date date,          -- 약 소진 예정일(비우면 디톡스 시작일 + 주수로 계산)
  revisit_date date,               -- 재진일(대면) / 2차 상담일(비대면)
  last_record_date date,           -- 마지막 기록일(앱 기록 또는 환자가 보낸 체중 사진)
  last_doctor_contact_date date,   -- 마지막 원장 연락일(케어 보드에서 "보냄"을 누르면 갱신)
  status text not null default 'active' check (status in ('active', 'ended')),
  ended_at date,
  memo text,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists diet_programs_status_idx on diet_programs (status);

alter table diet_programs enable row level security;

drop policy if exists "authenticated can read diet_programs" on diet_programs;
create policy "authenticated can read diet_programs" on diet_programs
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert diet_programs" on diet_programs;
create policy "authenticated can insert diet_programs" on diet_programs
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can update diet_programs" on diet_programs;
create policy "authenticated can update diet_programs" on diet_programs
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can delete diet_programs" on diet_programs;
create policy "authenticated can delete diet_programs" on diet_programs
  for delete to authenticated using (public.is_approved_staff());

-- 카톡을 보냈는지(또는 건너뛰었는지) 기록 — 같은 환자·같은 메시지·같은 예정일은 한 번만.
create table if not exists diet_program_sends (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references diet_programs(id) on delete cascade,
  code text not null,              -- 메시지 종류(예: weekly, refill)
  due_date date not null,
  action text not null default 'sent' check (action in ('sent', 'skipped')),
  by_staff uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (program_id, code, due_date)
);

alter table diet_program_sends enable row level security;

drop policy if exists "authenticated can read diet_program_sends" on diet_program_sends;
create policy "authenticated can read diet_program_sends" on diet_program_sends
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert diet_program_sends" on diet_program_sends;
create policy "authenticated can insert diet_program_sends" on diet_program_sends
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can delete diet_program_sends" on diet_program_sends;
create policy "authenticated can delete diet_program_sends" on diet_program_sends
  for delete to authenticated using (public.is_approved_staff());
