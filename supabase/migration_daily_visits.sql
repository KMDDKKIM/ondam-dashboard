-- 일일결산 표의 "환자 목록"(그날 실제로 내원한 환자: 이름·차트번호·진료의·수납)을 날짜별로 저장한다.
-- 초진환자 해피콜의 초진·재초진 후보를 "예약 명단"이 아니라 이 명단(실제 내원자)에서 뽑는 데 쓰고,
-- 이전 내원일 기록으로 재진/재초진을 가려낸다. 이름과 차트번호가 들어가므로 승인된 직원만 다룰 수 있다.
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
-- 여러 번 실행해도 안전하다.

create table if not exists daily_visits (
  id uuid primary key default gen_random_uuid(),
  visit_date date not null,
  chart_no text not null default '',
  patient_name text not null,
  doctor_name text not null default '',
  total_fee integer,        -- 총진료비
  patient_pay integer,      -- 환자부담계
  coverage text,            -- 구분(경로10%, 정율, 자동차보험, 보호1종 …)
  unpaid integer,           -- 미수금
  cash_pay integer,         -- 현금수납
  card_pay integer,         -- 카드수납
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists daily_visits_date_idx on daily_visits (visit_date);
create index if not exists daily_visits_chart_idx on daily_visits (chart_no);

alter table daily_visits enable row level security;

drop policy if exists "approved staff can read daily_visits" on daily_visits;
create policy "approved staff can read daily_visits" on daily_visits
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can insert daily_visits" on daily_visits;
create policy "approved staff can insert daily_visits" on daily_visits
  for insert to authenticated with check (public.is_approved_staff());

-- 같은 날 결산을 다시 붙여넣으면 그 날짜의 명단을 지우고 새로 넣는다(삭제 정책이 없으면 지워지지 않고 오류도 나지 않는다).
drop policy if exists "approved staff can delete daily_visits" on daily_visits;
create policy "approved staff can delete daily_visits" on daily_visits
  for delete to authenticated using (public.is_approved_staff());

revoke all on daily_visits from anon;

-- 결산표 합계 줄의 신규환자수(초진 수) — 후보 대조("신규 N명 중 M명 등록")에 쓴다.
alter table daily_revenue add column if not exists new_patient_count integer;
