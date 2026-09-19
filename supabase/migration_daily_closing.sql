-- 일일 결산 입력에서 함께 저장하는 예약·추나·제외환자 숫자(하루 한 행, 결산표 행에 붙인다)와,
-- 대시보드 한약/다이어트/특수한약/추나 실적을 손으로 고칠 때 쓰는 보정값.
alter table daily_revenue add column if not exists reservation_count integer; -- 오늘 예약 환자수
alter table daily_revenue add column if not exists kept_count integer;        -- 예약 정상 이행
alter table daily_revenue add column if not exists noshow_count integer;      -- 예약 노쇼
alter table daily_revenue add column if not exists cancel_count integer;      -- 예약 취소
alter table daily_revenue add column if not exists next_booking_count integer; -- 다음예약 접수한 환자수
alter table daily_revenue add column if not exists chuna_count integer;       -- 추나 횟수(인원)
alter table daily_revenue add column if not exists excluded_count integer;    -- 제외환자수

-- 자동 집계에 더하거나 빼는 값(예: 한약 -2). 기본 0.
alter table monthly_goals add column if not exists herb_adjust integer not null default 0;
alter table monthly_goals add column if not exists diet_adjust integer not null default 0;
alter table monthly_goals add column if not exists special_herb_adjust integer not null default 0;
alter table monthly_goals add column if not exists chuna_adjust integer not null default 0;
