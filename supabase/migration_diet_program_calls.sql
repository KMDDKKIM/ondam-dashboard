-- 린다이어트 프로그램에서 데스크(코디) 해피콜을 자동으로 만들 때, 어떤 해피콜이 어느 프로그램의 어떤 단계인지 연결해 둔다 — 2026-10-20 원장 요청.
-- 해피콜 자체는 기존 happy_call_manual_entries(해피콜 목록)에 만들고, 이 표는 날짜가 바뀌거나 프로그램을 지울 때 아직 손대지 않은 해피콜만
-- 골라 고치기 위한 연결 표다. 먼저 migration_diet_programs.sql 을 실행해 diet_programs 표가 있어야 한다.

create table if not exists diet_program_calls (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references diet_programs(id) on delete cascade,
  code text not null,              -- 단계 종류(예: detox-eve, monthly, reorder)
  due_date date not null,
  entry_id uuid not null references happy_call_manual_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (program_id, code, due_date)
);

create index if not exists diet_program_calls_program_idx on diet_program_calls (program_id);

alter table diet_program_calls enable row level security;

drop policy if exists "authenticated can read diet_program_calls" on diet_program_calls;
create policy "authenticated can read diet_program_calls" on diet_program_calls
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert diet_program_calls" on diet_program_calls;
create policy "authenticated can insert diet_program_calls" on diet_program_calls
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can delete diet_program_calls" on diet_program_calls;
create policy "authenticated can delete diet_program_calls" on diet_program_calls
  for delete to authenticated using (public.is_approved_staff());
