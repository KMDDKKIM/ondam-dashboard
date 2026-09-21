-- 접수기록부(종이 접수 노트를 대신하는 하루 접수 명단).
-- 날짜별로 번호·성명·생년월일·치료내역·진료비·결제(현금/카드/미수)·예약 여부·비고를 적는다.
-- 이름과 생년월일이 들어가므로 승인된 직원만 읽고 쓸 수 있다(익명 접근 차단).
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
-- 여러 번 실행해도 안전하다.

create table if not exists reception_records (
  id uuid primary key default gen_random_uuid(),
  visit_date date not null,
  seq integer not null,
  -- 이름 앞에 적는 "초)" / "재초)" 표시. 비어 있으면 재진.
  visit_kind text check (visit_kind in ('초', '재초')),
  patient_name text not null,
  -- 손으로 적던 "44.6.30" 모양 그대로 받는다(두 자리 연도라 날짜 타입으로 바꾸지 않는다).
  birth_date text,
  treatment text,
  fee integer check (fee is null or fee >= 0),
  payment text check (payment in ('현금', '카드', '미수')),
  -- 종이 접수 노트에서 번호 왼쪽에 하던 체크 표시 = 다음 예약을 잡았는지.
  reserved boolean not null default false,
  note text,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reception_records_date_idx on reception_records (visit_date, seq);

alter table reception_records enable row level security;

drop policy if exists "approved staff can read reception_records" on reception_records;
create policy "approved staff can read reception_records" on reception_records
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can insert reception_records" on reception_records;
create policy "approved staff can insert reception_records" on reception_records
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "approved staff can update reception_records" on reception_records;
create policy "approved staff can update reception_records" on reception_records
  for update to authenticated using (public.is_approved_staff()) with check (public.is_approved_staff());

-- 잘못 적은 줄을 지울 수 있어야 한다(정책이 없으면 지워지지 않고 오류도 나지 않는다).
drop policy if exists "approved staff can delete reception_records" on reception_records;
create policy "approved staff can delete reception_records" on reception_records
  for delete to authenticated using (public.is_approved_staff());

revoke all on reception_records from anon;
