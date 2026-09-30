-- 한약 처방전에 처방명(예: 보중익기탕) 칸을 추가한다(원장 요청, 2026-09-30).
-- 과거 기록 검색에서 환자별로 어떤 처방을 받았는지 찾아보는 용도.
-- 여러 번 실행해도 안전하다.

alter table herb_compounding_orders add column if not exists prescription_name text;
