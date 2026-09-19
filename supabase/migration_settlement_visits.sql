-- 일일결산에서 그날 내원환자수를, 월말결산에서 진료일평균환자수를 같이 저장한다.
-- 홈의 "일평균 환자수"를 결산표 기준으로 계산하기 위한 칸이다(월말결산 > 일일결산 누적).
alter table daily_revenue add column if not exists visit_count integer;
alter table monthly_revenue_override add column if not exists avg_daily_visits numeric;
