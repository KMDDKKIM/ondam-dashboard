-- 케어 보드 환자 종류에 "특수한약(공진단·경옥고 등)" 추가 — 2026-10-23 원장 요청.
-- 먼저 migration_care_board_kind.sql 을 실행해 kind 칸이 있어야 한다.

alter table care_board_patients drop constraint if exists care_board_patients_kind_check;
alter table care_board_patients add constraint care_board_patients_kind_check check (kind in ('herb', 'diet', 'special'));
