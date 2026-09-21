-- 한약 처방 대기방: 직원이 한약 처방을 신청하면 원장이 복용법을 출력하고 "완료"로 표시한다.
-- 신청 내용(환자 성함·차트번호·주치의·한약/횟차·전달사항)은 대기 중일 때 고칠 수 있고, 완료하면 완료 목록으로 넘어간다.
-- 이름·차트번호가 들어가므로 승인된 직원만 읽고 쓸 수 있다.
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
-- 여러 번 실행해도 안전하다.

create table if not exists herb_queue (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  chart_no text not null default '',
  doctor_name text not null default '',      -- 주치의(진료의 목록의 이름)
  herb_desc text not null,                   -- 한약/횟차 (예: 일반한약 15일, 첩약건보 10일 (비염))
  note text not null default '',             -- 전달사항 (예: (월) 오전 달여서 택배출고)
  status text not null default 'waiting' check (status in ('waiting', 'done')),
  requested_by uuid references staff(id) on delete set null,
  requested_by_name text not null default '',
  created_at timestamptz not null default now(),
  done_by uuid references staff(id) on delete set null,
  done_by_name text not null default '',
  done_at timestamptz
);

create index if not exists herb_queue_status_idx on herb_queue (status, created_at);

alter table herb_queue enable row level security;

drop policy if exists "approved staff can read herb_queue" on herb_queue;
create policy "approved staff can read herb_queue" on herb_queue
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can insert herb_queue" on herb_queue;
create policy "approved staff can insert herb_queue" on herb_queue
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "approved staff can update herb_queue" on herb_queue;
create policy "approved staff can update herb_queue" on herb_queue
  for update to authenticated using (public.is_approved_staff()) with check (public.is_approved_staff());

-- 잘못 올린 신청을 지울 수 있어야 한다(정책이 없으면 지워지지 않고 오류도 나지 않는다).
drop policy if exists "approved staff can delete herb_queue" on herb_queue;
create policy "approved staff can delete herb_queue" on herb_queue
  for delete to authenticated using (public.is_approved_staff());

revoke all on herb_queue from anon;
