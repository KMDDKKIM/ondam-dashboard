-- 연차 신청을 반려할 때 적는 반려 사유를 저장한다(원장 요청, 2026-10-02).
-- 여러 번 실행해도 안전하다.

alter table leave_requests add column if not exists decision_note text;
