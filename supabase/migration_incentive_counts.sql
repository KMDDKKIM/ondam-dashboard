-- 인센티브: 추나처럼 "건당 고정 금액" 항목은 환자별로 입력하지 않고 월말에 개수만 세어 입력한다 — 2026-10-30 원장 요청.
-- (개수 × 건당 금액이 자동으로 지급액이 된다.) 다른 인센티브 표와 같이 일반 클라이언트는 접근할 수 없고(RLS 정책 없음)
-- src/app/api/incentive/... 의 admin 클라이언트로만 읽고 쓴다. 여러 번 실행해도 안전하다.

create table if not exists incentive_counts (
  category_id uuid not null references incentive_categories(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  profile_id uuid not null references incentive_profiles(id) on delete cascade,
  count int not null default 0 check (count >= 0),
  updated_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (category_id, month)
);
alter table incentive_counts enable row level security;
-- 의도적으로 정책을 하나도 만들지 않는다(= 일반 클라이언트는 전부 거부).
