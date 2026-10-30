-- 해피콜 규칙(언제 거는지)을 한의원에서 직접 바꾸는 설정 — 2026-10-30 원장 요청.
-- 비급여 현황 > 해피콜 규칙 화면에서 한약·특수한약·린다이어트의 해피콜 날짜 규칙을 정한다. 승인된 직원은 보기만, 원장만 바꾼다.
-- 규칙이 없으면(이 SQL을 실행하기 전이거나 한 번도 저장하지 않았으면) 코드에 들어 있는 기본 규칙(지금까지 쓰던 방식)이 쓰인다.
-- 여러 번 실행해도 안전하다.

create table if not exists happy_call_rules (
  id text primary key default 'main' check (id = 'main'),
  config jsonb not null,
  updated_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- 마지막으로 "아직 안 건 해피콜에도 적용"을 누른 시각
  applied_at timestamptz
);
alter table happy_call_rules enable row level security;
drop policy if exists "approved staff can read happy_call_rules" on happy_call_rules;
create policy "approved staff can read happy_call_rules" on happy_call_rules
  for select to authenticated using (public.is_approved_staff());
drop policy if exists "owner can insert happy_call_rules" on happy_call_rules;
create policy "owner can insert happy_call_rules" on happy_call_rules
  for insert to authenticated with check (public.is_owner());
drop policy if exists "owner can update happy_call_rules" on happy_call_rules;
create policy "owner can update happy_call_rules" on happy_call_rules
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- 일반 한약 처방전에서도 내원 유도(약 소진 전 연락) 해피콜을 만들 수 있게 세 번째 연결 칸을 둔다.
alter table herb_compounding_orders add column if not exists call_entry_id_3 uuid references happy_call_manual_entries(id) on delete set null;
