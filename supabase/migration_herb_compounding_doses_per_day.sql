-- 한약 처방전에 "하루 몇 번 복용" 칸을 추가한다(원장 요청, 2026-09-30).
-- 팩수 = 하루 복용횟수 × 며칠분으로 화면에서 자동 계산해 저장한다.
-- 여러 번 실행해도 안전하다.

alter table herb_compounding_orders add column if not exists doses_per_day numeric;
