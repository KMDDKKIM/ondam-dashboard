-- 케어 보드에 린다이어트 환자도 원장이 직접 등록 — 2026-10-23 원장 요청. 환자 종류(한약/린다이어트)를 구분한다.
-- 먼저 migration_herb_packages.sql 을 실행해 care_board_patients 표가 있어야 한다.

alter table care_board_patients add column if not exists kind text not null default 'herb';
alter table care_board_patients drop constraint if exists care_board_patients_kind_check;
alter table care_board_patients add constraint care_board_patients_kind_check check (kind in ('herb', 'diet'));
