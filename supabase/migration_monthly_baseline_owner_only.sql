-- 월말결산 덮어쓰기(monthly_revenue_override)는 그 달 총매출 누계의 기준값을 통째로 바꾸는
-- 만큼 대표원장만 할 수 있게 DB에서도 막는다. 화면·API(/api/monthly-baseline)를 원장 전용으로
-- 막아 두었어도, 이 규칙이 없으면 사원 계정이 DB를 직접 불러 예전처럼 덮어쓸 수 있다
-- (감사 결과 #4). 읽기는 그대로 승인된 직원이면 누구나 볼 수 있다(대시보드 표시용).
-- 전제: migration_rls_approved_only.sql이 먼저 적용되어 있어야 한다. 여러 번 실행해도 안전하다.

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff where id = auth.uid() and status = 'approved' and role = 'owner'
  )
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

drop policy if exists "authenticated can insert monthly_revenue_override" on monthly_revenue_override;
drop policy if exists "authenticated can update monthly_revenue_override" on monthly_revenue_override;
drop policy if exists "owner can insert monthly_revenue_override" on monthly_revenue_override;
drop policy if exists "owner can update monthly_revenue_override" on monthly_revenue_override;

create policy "owner can insert monthly_revenue_override" on monthly_revenue_override
  for insert to authenticated with check (public.is_owner());
create policy "owner can update monthly_revenue_override" on monthly_revenue_override
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
