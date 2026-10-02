-- 부원장 인센티브 계산(원장 요청, 2026-10-02). 일반 로그인 클라이언트(RLS)는 이 세
-- 표에 전혀 접근할 수 없다 — daily_records/reservations와 같은 패턴으로, 전부
-- src/app/api/incentive/... 의 admin(service_role) 클라이언트를 통해서만 접근한다.
-- "직원은 금액/비율을 못 본다"를 행 단위가 아니라 "API 응답에서 그 필드를 아예 뺀다"는
-- 애플리케이션 레이어 규칙으로 강제하기 위함 — RLS의 행 필터만으로는 표현이 안 된다.
-- 여러 번 실행해도 안전하다.

create table if not exists incentive_profiles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references staff(id) on delete cascade,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists incentive_categories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references incentive_profiles(id) on delete cascade,
  name text not null,
  color text not null default '#888888',
  calc_type text not null check (calc_type in ('percent_of_amount', 'fixed_per_entry')),
  percent numeric,
  fixed_amount numeric,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists incentive_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references incentive_profiles(id) on delete cascade,
  category_id uuid not null references incentive_categories(id) on delete restrict,
  entry_date date not null,
  patient_name text not null,
  amount numeric not null default 0,
  note text,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table incentive_profiles enable row level security;
alter table incentive_categories enable row level security;
alter table incentive_entries enable row level security;
-- 의도적으로 정책을 하나도 만들지 않는다(= 일반 클라이언트는 전부 거부).
