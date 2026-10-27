-- 린다이어트 기록 체크에서 "더 이상 연락 안 할 환자" 제외 — 2026-10-27 원장 요청.
-- 기록을 안 하기로 했거나 종료한 환자처럼 조건에는 맞지만 연락할 필요가 없는 환자를 제외해 두면, 이후 아침 리포트에서 목록에 나오지 않는다.
-- 먼저 migration_leandiet_reports.sql 이 실행돼 있어야 한다. 모든 승인 직원이 제외·되돌리기를 할 수 있다.

create table if not exists leandiet_excluded_patients (
  lean_patient_id text primary key,
  patient_name text not null,
  reason text not null,
  excluded_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table leandiet_excluded_patients enable row level security;
drop policy if exists "approved staff can read leandiet_excluded_patients" on leandiet_excluded_patients;
create policy "approved staff can read leandiet_excluded_patients" on leandiet_excluded_patients
  for select to authenticated using (public.is_approved_staff());
drop policy if exists "approved staff can insert leandiet_excluded_patients" on leandiet_excluded_patients;
create policy "approved staff can insert leandiet_excluded_patients" on leandiet_excluded_patients
  for insert to authenticated with check (public.is_approved_staff());
drop policy if exists "approved staff can update leandiet_excluded_patients" on leandiet_excluded_patients;
create policy "approved staff can update leandiet_excluded_patients" on leandiet_excluded_patients
  for update to authenticated using (public.is_approved_staff());
drop policy if exists "approved staff can delete leandiet_excluded_patients" on leandiet_excluded_patients;
create policy "approved staff can delete leandiet_excluded_patients" on leandiet_excluded_patients
  for delete to authenticated using (public.is_approved_staff());
