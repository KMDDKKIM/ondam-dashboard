-- 연차는 해가 지나면 미사용분이 소멸되도록(원장 요청, 2026-10-02) leave_adjustments에
-- "이 부여·조정이 적용되는 연도"를 추가한다. 월차는 이 값과 무관하게 계속 누적된다.
-- 여러 번 실행해도 안전하다.

alter table leave_adjustments add column if not exists year integer;

update leave_adjustments
set year = extract(year from (created_at at time zone 'Asia/Seoul'))::integer
where year is null;

alter table leave_adjustments alter column year set not null;
alter table leave_adjustments alter column year set default extract(year from (now() at time zone 'Asia/Seoul'))::integer;
