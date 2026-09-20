-- 월말결산(monthly_revenue_override)에 "기준일"을 둔다.
-- 예전에는 월말결산 값이 일일결산 합계를 통째로 대체해서, 그 뒤에 들어온 일일 마감이
-- 총매출에 반영되지 않았다. 이제 월말결산은 기준일(as_of_date)까지의 값이고,
-- 그 달 총매출 = 월말결산 총매출 + 기준일 이후(date > as_of_date) 일일결산 합계이다.
-- 기준일이 null인 옛 행은 예전처럼 월말결산 값만 쓰고 화면에 경고를 띄운다.
alter table monthly_revenue_override add column if not exists as_of_date date;

-- 기존 2026-09 행: 2026-09-19에 월말결산표에서 붙여넣은 "월 누계" 값이므로
-- 기준일을 2026-09-19로 채운다(대표 확인한 실제 데이터). 이미 기준일이 있으면 건드리지 않는다.
update monthly_revenue_override
   set as_of_date = date '2026-09-19'
 where month = '2026-09'
   and as_of_date is null;
