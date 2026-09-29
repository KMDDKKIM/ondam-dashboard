-- 한약 처방전에 팩용량·며칠분·팩수·총물량 칸을 추가한다(원장 요청, 2026-09-29).
-- 여러 번 실행해도 안전하다.

alter table herb_compounding_orders add column if not exists pack_volume_ml numeric;
alter table herb_compounding_orders add column if not exists days_supply numeric;
alter table herb_compounding_orders add column if not exists pack_count numeric;
alter table herb_compounding_orders add column if not exists total_liquid_ml numeric;
