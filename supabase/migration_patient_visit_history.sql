-- 환자별 내원 이력(OK차트 "내원일수/진료비 분석" 표를 붙여넣어 가져온다).
-- 초진환자 해피콜의 초진·재초진 판정에 쓴다: 기간 중 처음/마지막 내원일, 차트 등록일로
-- "최근 3개월 안에 온 적 있는 환자(재진)", "예전 차트인데 3개월 이상 안 온 환자(재초진)", "새 차트(초진)"를 가려낸다.
-- 이름·연락처가 들어가므로 승인된 직원만 다룰 수 있다(주소 등 다른 정보는 저장하지 않는다).
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
-- 여러 번 실행해도 안전하다.

create table if not exists patient_visit_history (
  chart_no text primary key,          -- 차트번호(예: 006544, 재등록 차트는 006366-1)
  patient_name text not null,
  phone text,
  registered_date date,               -- 차트 등록일
  first_visit date,                   -- 기간 중 처음 내원일
  last_visit date,                    -- 기간 중 마지막 내원일
  visit_days integer,                 -- 기간 중 내원일수
  inflow text,                        -- 유입경로(소개, 간판, 재초진 …)
  period_start date,                  -- 분석 기간 시작
  period_end date,                    -- 분석 기간 끝
  updated_at timestamptz not null default now()
);

create index if not exists patient_visit_history_registered_idx on patient_visit_history (registered_date);

alter table patient_visit_history enable row level security;

drop policy if exists "approved staff can read patient_visit_history" on patient_visit_history;
create policy "approved staff can read patient_visit_history" on patient_visit_history
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can insert patient_visit_history" on patient_visit_history;
create policy "approved staff can insert patient_visit_history" on patient_visit_history
  for insert to authenticated with check (public.is_approved_staff());

-- 같은 차트번호를 다시 가져오면 값을 덮어쓴다(upsert).
drop policy if exists "approved staff can update patient_visit_history" on patient_visit_history;
create policy "approved staff can update patient_visit_history" on patient_visit_history
  for update to authenticated using (public.is_approved_staff()) with check (public.is_approved_staff());

revoke all on patient_visit_history from anon;
