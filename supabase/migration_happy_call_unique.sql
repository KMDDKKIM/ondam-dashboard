-- 해피콜 자동 등록 중복 방지(2026-10-03): 접수기록부의 초진·재초진을 화면을 여는 직원마다 자동으로 올리기 때문에,
-- 두 명이 거의 동시에 열면 같은 사람이 두 줄 생길 수 있다. 같은 초진일·같은 성함·같은 생년월일(자동 등록 줄은 생년월일이 있다)은
-- 한 줄만 허용한다. 생년월일이 없는 직접 등록 줄에는 영향이 없다.
create unique index if not exists happy_call_patients_auto_unique
  on happy_call_patients (first_visit_date, patient_name, birth_date)
  where birth_date is not null;
