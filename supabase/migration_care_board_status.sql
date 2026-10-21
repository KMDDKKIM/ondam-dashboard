-- 케어 보드 환자에 "종료" 상태 추가 — 2026-10-21 원장 요청. 종료해도 메모는 남고 "종료된 환자"에서 다시 진행할 수 있다.
-- 먼저 migration_herb_packages.sql 을 실행해 care_board_patients 표가 있어야 한다.

alter table care_board_patients add column if not exists status text not null default 'active';
alter table care_board_patients drop constraint if exists care_board_patients_status_check;
alter table care_board_patients add constraint care_board_patients_status_check check (status in ('active', 'ended'));
alter table care_board_patients add column if not exists ended_at date;
