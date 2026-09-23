-- 접수기록부 결제 "제외" 라벨을 "없음"으로 바꿨는데(2026-09-24 커밋) 이 제약조건을 안 고쳐서
-- 실제 DB에는 "없음"을 저장하려 하면 거부되던 문제를 고친다(체크 제약이 옛 값 '제외'만 허용).
-- 기존에 저장된 '제외' 값도 새 이름으로 옮긴다. 여러 번 실행해도 안전하다.

alter table reception_records drop constraint if exists reception_records_payment_check;

update reception_records set payment = '없음' where payment = '제외';

alter table reception_records add constraint reception_records_payment_check
  check (payment in ('현금', '카드', '미수', '없음'));
