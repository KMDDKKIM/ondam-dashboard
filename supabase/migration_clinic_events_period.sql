-- 한의원 이벤트에 기간(끝나는 날)을 추가한다(원장 요청, 2026-10-02). 기존 event_date는
-- "시작일"로 그대로 쓰고, 하루짜리 이벤트는 end_date = event_date. 여러 번 실행해도 안전하다.

alter table clinic_events add column if not exists end_date date;

update clinic_events set end_date = event_date where end_date is null;

alter table clinic_events alter column end_date set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinic_events_range') then
    alter table clinic_events add constraint clinic_events_range check (end_date >= event_date);
  end if;
end $$;
