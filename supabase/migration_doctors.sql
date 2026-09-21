-- 진료의 목록을 직원 계정과 분리한다.
-- 예전에는 "승인된 직원"이 곧 진료의 후보라서 계정이 없는 부원장님은 목록에 넣을 수 없었다.
-- 이제 doctors 테이블이 진료의 목록이다: 대표원장이 추가·이름 변경·숨김을 할 수 있고(계정과 무관),
-- 계정이 있는 직원이면 staff_id 로 연결해 둔다.
-- 전제: migration_rls_approved_only.sql 이 먼저 적용되어 public.is_approved_staff() 가 있어야 한다.
-- 여러 번 실행해도 안전하다.
--
-- happy_call_patients.doctor_staff_id 는 이제 doctors.id 를 담는다. 기존 환자 행은 직원 id(=김동규 대표원장의
-- staff id)를 담고 있으므로, 같은 id 를 그대로 doctors.id 로 시드해서 기존 기록이 계속 그 진료의를 가리키게 한다.

create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  staff_id uuid references staff(id) on delete set null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table doctors enable row level security;

drop policy if exists "approved staff can read doctors" on doctors;
create policy "approved staff can read doctors" on doctors
  for select to authenticated using (public.is_approved_staff());

-- 목록 관리(추가/이름 변경/숨김)는 대표원장(owner)만.
drop policy if exists "owner can insert doctors" on doctors;
create policy "owner can insert doctors" on doctors
  for insert to authenticated
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.role = 'owner' and s.status = 'approved'));

drop policy if exists "owner can update doctors" on doctors;
create policy "owner can update doctors" on doctors
  for update to authenticated
  using (exists (select 1 from staff s where s.id = auth.uid() and s.role = 'owner' and s.status = 'approved'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.role = 'owner' and s.status = 'approved'));

revoke all on doctors from anon;
revoke delete on doctors from authenticated;

-- 진료의 id 가 직원 id 가 아닌 값(계정 없는 진료의)도 담을 수 있도록 직원 외래키를 푼다.
do $$
declare
  fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.happy_call_patients'::regclass
      and con.contype = 'f'
      and att.attname = 'doctor_staff_id'
  loop
    execute format('alter table public.happy_call_patients drop constraint %I', fk.conname);
  end loop;
end $$;

-- 시드 1) 지금 환자 기록이 가리키는 직원들(같은 id 로) + 대표원장
insert into doctors (id, name, staff_id, sort_order)
select distinct s.id, s.name, s.id, 1
from staff s
where s.role = 'owner'
   or s.id in (select doctor_staff_id from happy_call_patients where doctor_staff_id is not null)
on conflict (name) do nothing;

-- 시드 2) 부원장
insert into doctors (name, sort_order) values ('박소은', 2) on conflict (name) do nothing;
