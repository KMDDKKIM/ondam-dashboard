-- 초진환자 해피콜 자동 등록(원장 요청, 2026-10-03): 접수기록부의 초진/재초진을 해피콜 표에 자동으로 올리고,
-- 이후 2진·3진은 성함+생년월일로 접수기록부에서 찾아 채운다.
--  - happy_call_patients.birth_date: 접수기록부에 적힌 생년월일(2진·3진 매칭 기준). 접수기록부와 같은 글자 형식.
--  - happy_call_auto_skips: 직원이 해피콜 표에서 지운 사람(초진일|이름)을 기억해 자동 등록이 다시 올리지 않게 한다.

alter table happy_call_patients add column if not exists birth_date text;

create table if not exists happy_call_auto_skips (
  skip_key text primary key,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table happy_call_auto_skips enable row level security;

drop policy if exists "authenticated can read happy_call_auto_skips" on happy_call_auto_skips;
create policy "authenticated can read happy_call_auto_skips" on happy_call_auto_skips
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert happy_call_auto_skips" on happy_call_auto_skips;
create policy "authenticated can insert happy_call_auto_skips" on happy_call_auto_skips
  for insert to authenticated with check (public.is_approved_staff());
