-- 해피콜 결과 기록: 통화완료 / 부재중 / 거부·연락불가 + 재시도 + 완료자/시각.
-- 모든 문장이 add column if not exists 라서 여러 번 실행해도 안전하다.
--
-- 결과값(result): 'answered'(통화완료), 'no_answer'(1차 부재중 — 콜은 아직 열려 있고
-- 예정일이 다음날로 옮겨진 상태), 'refused'(거부/연락불가), 'unreachable'(두 번째
-- 부재중으로 "연락 안 됨" 종료). attempts 는 지금까지 건 횟수.
-- 완료자(completed_by)는 staff 삭제 시 null 로 비운다(기록은 남긴다).
--
-- 콜을 저장하는 방식(원본 컬럼 재사용):
--  - 한약(herb_medicine_prescriptions): 콜 3개가 한 행에 있어 call_N_* 컬럼을 콜마다 추가.
--    예정일=call_date_N, 종료 여부=call_N_done, 메모=call_N_note 를 그대로 쓴다.
--  - 린다이어트(diet_package_calls): 예정일=call_date, 종료=done, 메모=note.
--  - 수동/비급여(happy_call_manual_entries): 예정일=call_date, 종료=done, 메모=done_note.
--  - 초진(happy_call_patients): 콜 전용 행이 없어(초진일+1일로 계산) 환자 행에
--    call_* 컬럼을 추가한다. 예정일을 바꾸면 call_due_date 에 저장(비어 있으면 초진일+1일).

-- 초진환자
alter table happy_call_patients add column if not exists call_due_date date;
alter table happy_call_patients add column if not exists call_attempts smallint not null default 0;
alter table happy_call_patients add column if not exists call_result text
  check (call_result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table happy_call_patients add column if not exists call_completed_by uuid references staff(id) on delete set null;
alter table happy_call_patients add column if not exists call_completed_at timestamptz;
alter table happy_call_patients add column if not exists call_memo text;

-- 한약 처방 (콜 1~3)
alter table herb_medicine_prescriptions add column if not exists call_1_attempts smallint not null default 0;
alter table herb_medicine_prescriptions add column if not exists call_1_result text
  check (call_1_result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table herb_medicine_prescriptions add column if not exists call_1_completed_by uuid references staff(id) on delete set null;
alter table herb_medicine_prescriptions add column if not exists call_1_completed_at timestamptz;

alter table herb_medicine_prescriptions add column if not exists call_2_attempts smallint not null default 0;
alter table herb_medicine_prescriptions add column if not exists call_2_result text
  check (call_2_result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table herb_medicine_prescriptions add column if not exists call_2_completed_by uuid references staff(id) on delete set null;
alter table herb_medicine_prescriptions add column if not exists call_2_completed_at timestamptz;

alter table herb_medicine_prescriptions add column if not exists call_3_attempts smallint not null default 0;
alter table herb_medicine_prescriptions add column if not exists call_3_result text
  check (call_3_result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table herb_medicine_prescriptions add column if not exists call_3_completed_by uuid references staff(id) on delete set null;
alter table herb_medicine_prescriptions add column if not exists call_3_completed_at timestamptz;

-- 린다이어트 콜
alter table diet_package_calls add column if not exists attempts smallint not null default 0;
alter table diet_package_calls add column if not exists result text
  check (result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table diet_package_calls add column if not exists completed_by uuid references staff(id) on delete set null;
alter table diet_package_calls add column if not exists completed_at timestamptz;

-- 수동/비급여 콜
alter table happy_call_manual_entries add column if not exists attempts smallint not null default 0;
alter table happy_call_manual_entries add column if not exists result text
  check (result in ('answered', 'no_answer', 'refused', 'unreachable'));
alter table happy_call_manual_entries add column if not exists completed_by uuid references staff(id) on delete set null;
alter table happy_call_manual_entries add column if not exists completed_at timestamptz;
