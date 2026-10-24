-- 린다이어트 아침 리포트 — 2026-10-24 원장 요청.
-- 매일 아침 원장님 PC의 예약 작업이 린다이어트 차트의 식단 기록 점검 결과를 대시보드로 보낸다(POST /api/leandiet/report).
-- 직원은 "린다이어트 기록 체크" 화면에서 환자별로 "직원 해피콜로 보내기" / "원장 케어 보드로 보내기"를 고른다.
-- 먼저 migration_manual_call_types.sql(해피콜 수동 콜)과 migration_herb_packages.sql(care_board_patients)이 실행돼 있어야 한다.

-- 일별 리포트: 날짜당 한 줄(같은 날짜가 다시 오면 덮어쓴다). 쓰기는 서버(service_role)만 한다.
create table if not exists leandiet_daily_reports (
  report_date date primary key,
  base_date date,
  generated_at timestamptz,
  received_at timestamptz not null default now(),
  criteria text,
  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null default '[]'::jsonb
);
alter table leandiet_daily_reports enable row level security;
drop policy if exists "approved staff can read leandiet_daily_reports" on leandiet_daily_reports;
create policy "approved staff can read leandiet_daily_reports" on leandiet_daily_reports
  for select to authenticated using (public.is_approved_staff());

-- 환자별 후속 연락: 어느 날짜 리포트의 어느 환자를 직원 해피콜(desk)/원장 케어 보드(owner)로 보냈는지.
create table if not exists leandiet_followups (
  id uuid primary key default gen_random_uuid(),
  lean_patient_id text not null,
  report_date date not null,
  target text not null check (target in ('desk', 'owner')),
  patient_name text not null,
  phone text,
  reason text,
  entry_id uuid references happy_call_manual_entries(id) on delete set null,
  care_patient_id uuid references care_board_patients(id) on delete set null,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lean_patient_id, report_date, target)
);
alter table leandiet_followups enable row level security;
drop policy if exists "approved staff can read leandiet_followups" on leandiet_followups;
create policy "approved staff can read leandiet_followups" on leandiet_followups
  for select to authenticated using (public.is_approved_staff());
drop policy if exists "approved staff can insert leandiet_followups" on leandiet_followups;
create policy "approved staff can insert leandiet_followups" on leandiet_followups
  for insert to authenticated with check (public.is_approved_staff());
drop policy if exists "approved staff can delete leandiet_followups" on leandiet_followups;
create policy "approved staff can delete leandiet_followups" on leandiet_followups
  for delete to authenticated using (public.is_approved_staff());
