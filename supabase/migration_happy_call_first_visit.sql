-- 초진환자 등록: 차트번호·연락처·초진/재초진 구분 + 등록 삭제 권한.
-- 모든 문장이 여러 번 실행해도 안전하다(add column if not exists / drop policy if exists).
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
--
-- visit_kind: '초진'(처음 온 환자, 기본값) / '재초진'(마지막 내원 후 달력 기준 3개월 이상 지나 다시 온 환자).
-- 재초진도 통계(재진율/삼진율)에서는 초진과 같이 센다.

alter table happy_call_patients add column if not exists chart_no text;
alter table happy_call_patients add column if not exists phone text;
alter table happy_call_patients add column if not exists visit_kind text not null default '초진';

alter table happy_call_patients drop constraint if exists happy_call_patients_visit_kind_check;
alter table happy_call_patients add constraint happy_call_patients_visit_kind_check
  check (visit_kind in ('초진', '재초진'));

-- 잘못 등록한 환자를 지울 수 있도록 승인된 직원에게만 DELETE 를 허용한다.
drop policy if exists "authenticated can delete happy_call_patients" on happy_call_patients;
create policy "authenticated can delete happy_call_patients" on happy_call_patients
  for delete to authenticated using (public.is_approved_staff());
