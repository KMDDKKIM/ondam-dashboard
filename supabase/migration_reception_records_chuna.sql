-- 접수기록부에 "추나" 체크 칸 추가 (원장 요청, 2026-09-24): 일일결산의 추나 인원·이름을
-- 예약 명단 치료 항목 텍스트 매칭 대신 접수기록부 체크로 정확히 센다. 이 파일은 여러 번
-- 실행해도 안전하다. reception_records 는 authenticated 에게 테이블 단위 UPDATE 권한이
-- 이미 있어(2026-09-24 실 DB 확인) 새 컬럼도 별도 grant 없이 바로 수정 가능하다.
alter table reception_records add column if not exists chuna boolean not null default false;
