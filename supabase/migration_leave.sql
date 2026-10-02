-- 직원 연차/월차 관리(원장 요청, 2026-10-02). 달력·휴가 신청은 승인된 직원 전체가 서로
-- 볼 수 있어야 해서(인센티브와 다르게) 정상적인 RLS 정책을 쓴다 — is_approved_staff()는
-- staff 표 설정 때 이미 만들어 둔 SECURITY DEFINER 헬퍼 함수를 그대로 재사용한다.
-- 여러 번 실행해도 안전하다.

alter table staff add column if not exists hire_date date;

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  half_day text check (half_day in ('am', 'pm')),
  kind text not null check (kind in ('monthly', 'annual')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  memo text,
  requested_by uuid references staff(id) on delete set null,
  decided_by uuid references staff(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leave_requests_range check (end_date >= start_date),
  constraint leave_requests_half_day_single_day check (half_day is null or start_date = end_date)
);

alter table leave_requests enable row level security;

drop policy if exists "approved staff can read leave_requests" on leave_requests;
create policy "approved staff can read leave_requests" on leave_requests
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can insert leave_requests" on leave_requests;
create policy "approved staff can insert leave_requests" on leave_requests
  for insert to authenticated with check (public.is_approved_staff());

-- 승인/거절은 원장만 바꿀 수 있다.
drop policy if exists "owner can update leave_requests" on leave_requests;
create policy "owner can update leave_requests" on leave_requests
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- 본인이 올린, 아직 결정 안 난 신청은 본인이 취소할 수 있고, 원장은 뭐든 지울 수 있다.
drop policy if exists "own pending or owner can delete leave_requests" on leave_requests;
create policy "own pending or owner can delete leave_requests" on leave_requests
  for delete to authenticated using (
    (requested_by = auth.uid() and status = 'pending') or public.is_owner()
  );

create table if not exists leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  kind text not null check (kind in ('monthly', 'annual')),
  days numeric not null,
  reason text,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table leave_adjustments enable row level security;

-- 본인 몫 조정 내역은 본인+원장만 볼 수 있다(남이 얼마나 더/덜 받았는지는 안 보임).
drop policy if exists "own or owner can read leave_adjustments" on leave_adjustments;
create policy "own or owner can read leave_adjustments" on leave_adjustments
  for select to authenticated using (staff_id = auth.uid() or public.is_owner());

drop policy if exists "owner can insert leave_adjustments" on leave_adjustments;
create policy "owner can insert leave_adjustments" on leave_adjustments
  for insert to authenticated with check (public.is_owner());
