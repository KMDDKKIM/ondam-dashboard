-- 비대면진료 새 신청 실시간 알림(RemoteConsultAlerter)용.
-- 전제: migration_remote_consult.sql 이 먼저 적용되어 remote_consult_requests 가 있어야 한다.
-- 여러 번 실행해도 안전하다.
--
-- Realtime 구독(postgres_changes)이 실제로 INSERT 이벤트를 받으려면 테이블을 supabase_realtime
-- publication 에 명시적으로 넣어야 한다(chat_messages 와 같은 방식, schema.sql 참고). 빠뜨리면 에러 없이
-- 조용히 아무 이벤트도 못 받는다. 이미 들어 있는 상태에서 다시 넣으면 에러가 나므로 먼저 확인한다.
--
-- 읽기 권한은 기존 RLS("approved staff can read remote_consult_requests") 그대로라, 승인된 직원만 이벤트를 받는다.
-- 화면은 이벤트에서 id 만 꺼내 쓰고 이름·진료·출처를 다시 읽는다(주민번호 앞자리 등 나머지 칸은 쓰지 않는다).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'remote_consult_requests'
  ) then
    alter publication supabase_realtime add table public.remote_consult_requests;
  end if;
end $$;
