-- 케어 보드 한약 환자의 원장 해피콜 — 2026-10-21 원장 요청.
-- 다음 해피콜 날짜를 정해 두면 그날 케어 보드·홈의 "오늘 연락할 분"에 뜨고, 해피콜을 마치면 마지막 해피콜 날짜가 남는다.
-- 먼저 migration_herb_packages.sql 을 실행해 care_board_patients 표가 있어야 한다.

alter table care_board_patients add column if not exists next_call_date date;
alter table care_board_patients add column if not exists last_call_date date;
