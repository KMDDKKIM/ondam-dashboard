-- 한약 복용법 출력(prescriptions) 테이블을 승인된 직원 전용으로 잠근다.
--
-- 왜: 이 테이블은 옛 한약 복용법 출력 사이트(비밀번호 게이트)가 anon 키로 쓰던 것이라
--     "anon full access" 정책(누구나 읽기/쓰기)이 걸려 있었다. 환자 이름·주소증이 들어
--     있는데, 사이트 주소에 들어 있는 공개 키만 있으면 로그인 없이도 읽고 쓸 수 있었다.
--     이제 대시보드(/herb-print)가 로그인 세션으로 접근하므로 승인된 직원만 통과시킨다.
--
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
-- 주의: 옛 한약 복용법 출력 사이트(hanyak-ondam)는 이 뒤로 이 테이블을 읽고 쓸 수 없다
--       (대시보드의 /herb-print 가 대신한다).
-- 여러 번 실행해도 안전하다. 한 트랜잭션이라 안전장치에 걸리면 전부 취소된다.

begin;

-- 1) 기존 정책을 이름과 상관없이 전부 지운다(예전 "anon full access" 포함).
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'prescriptions'
  loop
    execute format('drop policy %I on public.prescriptions', pol.policyname);
  end loop;
end $$;

alter table public.prescriptions enable row level security;

-- 2) 승인된 직원만 읽기/쓰기/수정/삭제.
create policy "approved staff can read prescriptions" on public.prescriptions
  for select to authenticated using (public.is_approved_staff());

create policy "approved staff can insert prescriptions" on public.prescriptions
  for insert to authenticated with check (public.is_approved_staff());

create policy "approved staff can update prescriptions" on public.prescriptions
  for update to authenticated using (public.is_approved_staff()) with check (public.is_approved_staff());

create policy "approved staff can delete prescriptions" on public.prescriptions
  for delete to authenticated using (public.is_approved_staff());

-- 3) 로그인하지 않은 요청(anon)에는 테이블 권한 자체를 거둔다(정책과 이중으로 막는다).
revoke all on public.prescriptions from anon;

-- 4) 안전장치: anon/public 대상이거나 조건이 항상 참(true)인 정책이 남아 있으면 전부 취소한다.
do $$
declare
  loose text;
  n int;
begin
  select string_agg(policyname, '; ') into loose
  from pg_policies
  where schemaname = 'public' and tablename = 'prescriptions'
    and (roles::text like '%anon%' or roles::text like '%public%' or coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');
  if loose is not null then
    raise exception 'prescriptions 에 느슨한 정책이 남아 있어요: %', loose;
  end if;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'prescriptions';
  if n < 4 then
    raise exception 'prescriptions 정책이 모자라요 (expected 4, found %)', n;
  end if;
end $$;

commit;
