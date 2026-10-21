-- 린다이어트 프로그램을 비급여 현황의 결제에서 만든다 — 2026-10-21 원장 요청.
-- 비급여 현황에서 린다이어트를 등록할 때 디톡스 시작일과 주수를 적으면 프로그램이 만들어지고, 디톡스 3일(시작일·다음날·다다음날)은 해피콜 목록에,
-- 다이어트환 시작일은 케어 보드(원장)에 연락할 일로 올라간다. 먼저 migration_diet_programs.sql 이 실행돼 있어야 한다.

alter table non_covered_purchases add column if not exists detox_start_date date;
alter table non_covered_purchases add column if not exists diet_weeks integer;

-- 이 프로그램을 만든 비급여 결제. 결제를 지우면 프로그램도 함께 지워진다.
alter table diet_programs add column if not exists purchase_id uuid unique references non_covered_purchases(id) on delete cascade;
