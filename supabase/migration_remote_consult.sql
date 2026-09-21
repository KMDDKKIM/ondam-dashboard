-- 비대면진료 신청(구글폼 자동 전송) 저장소.
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
-- 여러 번 실행해도 안전하다.
--
-- 신청 내용은 remote_consult_requests, 주민등록번호 원문은 암호문으로만 remote_consult_rrn 에 둔다.
-- 앱 화면(로그인한 직원)은 신청 목록을 읽고 처리 상태만 바꿀 수 있고, 새 신청을 넣는 것은 서버
-- (service_role, 구글 시트가 부르는 API)만 한다. 주민번호 암호문 테이블은 직원 화면에서 직접 읽을 수 없다.

create table if not exists remote_consult_requests (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'google_form',
  dedupe_key text not null unique,
  submitted_at timestamptz not null,
  created_at timestamptz not null default now(),
  patient_name text not null default '',
  phone text not null default '',
  address text not null default '',
  rrn_prefix text,
  service text not null default '',
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'success', 'fail', 'absent')),
  handled_by uuid references staff(id) on delete set null,
  handled_at timestamptz,
  memo text not null default ''
);

create index if not exists remote_consult_requests_submitted_idx on remote_consult_requests (submitted_at desc);
create index if not exists remote_consult_requests_status_idx on remote_consult_requests (status);

alter table remote_consult_requests enable row level security;

drop policy if exists "approved staff can read remote_consult_requests" on remote_consult_requests;
create policy "approved staff can read remote_consult_requests" on remote_consult_requests
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can update remote_consult_requests" on remote_consult_requests;
create policy "approved staff can update remote_consult_requests" on remote_consult_requests
  for update to authenticated using (public.is_approved_staff()) with check (public.is_approved_staff());

drop policy if exists "approved staff can delete remote_consult_requests" on remote_consult_requests;
create policy "approved staff can delete remote_consult_requests" on remote_consult_requests
  for delete to authenticated using (public.is_approved_staff());

-- 직원 화면에서는 처리 상태·메모만 고칠 수 있다(이름·연락처·주소·신청 내용은 바꿀 수 없다).
revoke update on remote_consult_requests from authenticated;
grant update (status, handled_by, handled_at, memo) on remote_consult_requests to authenticated;
revoke insert on remote_consult_requests from authenticated, anon;
revoke all on remote_consult_requests from anon;

create table if not exists remote_consult_rrn (
  request_id uuid primary key references remote_consult_requests(id) on delete cascade,
  ciphertext text not null
);

alter table remote_consult_rrn enable row level security;
revoke all on remote_consult_rrn from anon, authenticated;

-- 주민번호를 화면에서 펼쳐 본 기록(누가, 언제, 어느 신청). 서버가 펼쳐 줄 때마다 남긴다.
create table if not exists remote_consult_rrn_views (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references remote_consult_requests(id) on delete cascade,
  viewed_by uuid references staff(id) on delete set null,
  viewed_at timestamptz not null default now()
);

alter table remote_consult_rrn_views enable row level security;
drop policy if exists "approved staff can read remote_consult_rrn_views" on remote_consult_rrn_views;
create policy "approved staff can read remote_consult_rrn_views" on remote_consult_rrn_views
  for select to authenticated using (public.is_approved_staff());
revoke insert, update, delete on remote_consult_rrn_views from authenticated;
revoke all on remote_consult_rrn_views from anon;
