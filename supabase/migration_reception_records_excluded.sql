-- 접수기록부에 "제외" 체크 칸 추가 (원장 요청, 2026-09-23): 오늘 오셨지만 예약률 계산
-- (내원환자수 − 제외환자수)에서 빼야 하는 분(진단서만 받아가신 분, 한약 처방전 출력만으로
-- 잡힌 경우 등)을 체크해 두면 일일결산의 "제외환자 수/이름"이 여기서 자동으로 채워진다
-- (추나 체크와 같은 방식). 이 파일은 여러 번 실행해도 안전하다.
alter table reception_records add column if not exists excluded boolean not null default false;
