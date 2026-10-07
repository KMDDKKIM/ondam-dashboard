-- 비대면진료 신청 보관 기한: 진료로 이어지지 않은 신청(실패·부재)은 처리한 지 30일이 지나면 자동으로 지운다.
-- (보폐고 엔오 랜딩 페이지 안내 문구 "진료로 이어지지 않은 신청 정보는 30일 이내 파기"를 지키기 위한 것.)
-- 전제: migration_remote_consult.sql 이 먼저 적용되어 있어야 하고, Supabase 에서 pg_cron 확장을 켜 둬야 한다
--       (Dashboard → Database → Extensions → pg_cron 켜기. 아래 create extension 이 권한 문제로 실패하면 그렇게 켠 뒤 다시 실행).
-- 여러 번 실행해도 안전하다.
--
-- - 대상: status 가 'fail'(실패)·'absent'(부재)이고, 처리 시각(handled_at, 없으면 접수 시각 created_at)이 30일 넘게 지난 신청.
-- - 대기(new)·성공(success)은 지우지 않는다. 실패·부재를 "대기로 되돌리기" 하면 handled_at 이 비워져 다시 대상에서 빠진다.
-- - 신청 행을 지우면 주민번호 암호문(remote_consult_rrn)과 주민번호 열람 기록(remote_consult_rrn_views)도 같이 지워진다(on delete cascade).
-- - 보관 일수(30일)는 이 함수의 기본값 한 곳에서만 정한다. 바꾸려면 여기만 고쳐 다시 실행한다.
-- - 매일 새벽 3시(한국 시각, = UTC 18:00)에 한 번 돈다.

create extension if not exists pg_cron;

create or replace function public.purge_stale_remote_consult_requests(p_days integer default 30)
returns integer
language plpgsql
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from remote_consult_requests
  where status in ('fail', 'absent')
    and coalesce(handled_at, created_at) < now() - make_interval(days => p_days);
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- 직원 화면(anon/authenticated)에서 RPC 로 부르지 못하게 막는다. pg_cron(postgres)만 부른다.
revoke all on function public.purge_stale_remote_consult_requests(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-remote-consult-requests') then
    perform cron.unschedule('purge-remote-consult-requests');
  end if;
end $$;

select cron.schedule(
  'purge-remote-consult-requests',
  '0 18 * * *',
  $$select public.purge_stale_remote_consult_requests();$$
);

-- 확인용(직접 실행해 보기):
--   select * from cron.job where jobname = 'purge-remote-consult-requests';
--   select * from cron.job_run_details order by start_time desc limit 5;
