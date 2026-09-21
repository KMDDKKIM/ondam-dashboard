-- 상담 녹음 차팅 AI 사용 기록 (하루 사용 한도를 "저장"이 아니라 "AI 생성" 횟수로 세기 위함)
-- 누가/언제만 남기고 환자 정보나 상담 내용은 담지 않는다. 기록은 추가만 되고 고치거나 지울 수 없다.
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
-- 여러 번 실행해도 안전하다(idempotent).

create table if not exists consult_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references staff(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists consult_usage_user_created_idx
  on consult_usage (user_id, created_at desc);

alter table consult_usage enable row level security;

-- 내 기록만 읽는다
drop policy if exists "read own consult_usage" on consult_usage;
create policy "read own consult_usage" on consult_usage
  for select to authenticated using (user_id = auth.uid());

-- 내 이름으로만, 승인된 직원만 남긴다 (update/delete 정책은 일부러 두지 않는다)
drop policy if exists "insert own consult_usage" on consult_usage;
create policy "insert own consult_usage" on consult_usage
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved_staff());
