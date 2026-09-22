-- 접수기록부 v2 (원장 결정, 2026-09-23):
--  - 구분: 축약형 "초"/"재초"를 풀어 쓴 "초진"/"재초진"으로 바꾼다(재진은 그대로).
--  - 결제: "제외"를 추가한다(린다이어트 상담·자보 환자처럼 결제 자체가 없는 경우).
-- 기존에 저장된 "초"/"재초" 값도 새 이름으로 옮긴다. 이 파일은 여러 번 실행해도 안전하다.

update reception_records set visit_kind = '초진' where visit_kind = '초';
update reception_records set visit_kind = '재초진' where visit_kind = '재초';

alter table reception_records drop constraint if exists reception_records_visit_kind_check;
alter table reception_records alter column visit_kind set default '재진';
alter table reception_records add constraint reception_records_visit_kind_check
  check (visit_kind in ('초진', '재초진', '재진'));

alter table reception_records drop constraint if exists reception_records_payment_check;
alter table reception_records add constraint reception_records_payment_check
  check (payment in ('현금', '카드', '미수', '제외'));
