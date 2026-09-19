-- 이번달 총매출 목표와 일평균 환자수 목표. 기존 한약/다이어트/특수한약/추나 목표와
-- 같은 monthly_goals 행(월 단위)에 칸을 더한다.
alter table monthly_goals add column if not exists revenue_goal bigint;
alter table monthly_goals add column if not exists avg_visits_goal numeric;
