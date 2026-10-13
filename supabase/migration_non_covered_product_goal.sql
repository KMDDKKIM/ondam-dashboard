-- 비급여 상품마다 "목표 반영" 기본값(원장 요청, 2026-10-13): 등록·수정 화면에서 상품을 고르면 목표 반영이 자동으로 채워진다.
-- 값은 한약 / 다이어트 / 특수한약 / 추나 중 하나(없으면 자동 채움 없음). 상품 목록 관리에서 상품마다 바꿀 수 있다.
-- 여러 번 실행해도 안전하다.

alter table non_covered_products add column if not exists goal_category text
  check (goal_category in ('herb', 'diet', 'special_herb', 'chuna'));

-- 이미 등록된 구매 기록에서, 그 상품에 가장 많이 쓴 목표 반영을 기본값으로 가져온다(직원들이 그동안 고른 대로 이어지게).
update non_covered_products p
set goal_category = (
  select pu.goal_category
  from non_covered_purchases pu
  where pu.product_name = p.name and pu.goal_category is not null
  group by pu.goal_category
  order by count(*) desc, pu.goal_category
  limit 1
)
where p.goal_category is null;

-- 그래도 비어 있는 특수한약 품목은 상품명으로 채운다.
update non_covered_products
set goal_category = 'special_herb'
where goal_category is null
  and (name like '%공진단%' or name like '%경옥고%' or name like '%녹용관절고%' or name like '%보폐고엔오%');
