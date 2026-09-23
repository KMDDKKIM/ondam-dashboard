-- 네이버 톡톡 새 메시지 배지 (원장 요청, 2026-09-23): 톡톡 파트너센터에서 챗봇API 웹훅을
-- 등록해 두면, 고객이 메시지를 보낼 때마다 네이버 서버가 우리 웹훅 주소로 알려준다. 그 이벤트를
-- 여기 저장해서 상단바 네이버톡톡 아이콘에 안읽은 개수를 배지로 보여준다(직접 답장은 그대로
-- 톡톡파트너센터에서 한다 — 이 표는 그냥 알림용 기록이라 자동응답을 보내지 않는다).
-- 웹훅은 로그인 세션이 없어(네이버 서버가 직접 호출) admin 클라이언트로만 쓴다 —
-- remote_consult_requests와 같은 방식. 이 파일은 여러 번 실행해도 안전하다.
create table if not exists naver_talktalk_events (
  id uuid primary key default gen_random_uuid(),
  naver_user_id text not null,
  received_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists naver_talktalk_events_unread_idx on naver_talktalk_events (received_at) where read_at is null;

alter table naver_talktalk_events enable row level security;

drop policy if exists "approved staff can read naver_talktalk_events" on naver_talktalk_events;
create policy "approved staff can read naver_talktalk_events" on naver_talktalk_events
  for select to authenticated using (public.is_approved_staff());

-- 네이버톡톡 아이콘을 누르면 안읽은 걸 모두 읽음 처리한다(read_at 만 갱신, 그 밖은 못 건드린다).
drop policy if exists "approved staff can mark naver_talktalk_events read" on naver_talktalk_events;
create policy "approved staff can mark naver_talktalk_events read" on naver_talktalk_events
  for update to authenticated using (public.is_approved_staff()) with check (public.is_approved_staff());
revoke update on naver_talktalk_events from authenticated;
grant update (read_at) on naver_talktalk_events to authenticated;

revoke insert on naver_talktalk_events from authenticated, anon;
revoke delete on naver_talktalk_events from authenticated, anon;
revoke all on naver_talktalk_events from anon;
