-- 홈 대시보드 개편(원장 요청, 2026-10-02): "오늘의 한마디" 대신 공지사항, 이번 달 현황
-- 옆에 한의원 달력(이벤트 + 연차). 여러 번 실행해도 안전하다.

-- 공지사항: 승인된 직원이면 누구나 쓰고, 표시할 하나를 고를 수 있다(todos와 같은 패턴).
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  is_pinned boolean not null default false,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table announcements enable row level security;

drop policy if exists "approved staff can read announcements" on announcements;
create policy "approved staff can read announcements" on announcements
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can insert announcements" on announcements;
create policy "approved staff can insert announcements" on announcements
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "approved staff can update announcements" on announcements;
create policy "approved staff can update announcements" on announcements
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can delete announcements" on announcements;
create policy "approved staff can delete announcements" on announcements
  for delete to authenticated using (public.is_approved_staff());

-- 한의원 이벤트(홈 달력에 보여줄 일정): 원장만 추가·삭제, 전 직원 읽기.
create table if not exists clinic_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table clinic_events enable row level security;

drop policy if exists "approved staff can read clinic_events" on clinic_events;
create policy "approved staff can read clinic_events" on clinic_events
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "owner can insert clinic_events" on clinic_events;
create policy "owner can insert clinic_events" on clinic_events
  for insert to authenticated with check (public.is_owner());

drop policy if exists "owner can delete clinic_events" on clinic_events;
create policy "owner can delete clinic_events" on clinic_events
  for delete to authenticated using (public.is_owner());
