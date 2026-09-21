-- 상담 녹음 차팅(상담 내용과 요약)은 원장님(대표원장 · 부원장)만 읽고 쓸 수 있게 DB에서도 막는다.
-- 화면 메뉴와 API 를 막아 두었어도, 이 규칙이 없으면 직원이 DB 를 직접 부를 때 열려 버린다.
-- 전제: migration_staff_grade.sql(staff.grade)과 migration_rls_approved_only.sql 이 먼저 적용되어 있어야 한다.
-- 여러 번 실행해도 안전하다.

create or replace function public.can_use_consult_chart()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where id = auth.uid() and status = 'approved' and grade in ('대표원장', '부원장')
  )
$$;

revoke all on function public.can_use_consult_chart() from public, anon;
grant execute on function public.can_use_consult_chart() to authenticated;

drop policy if exists "authenticated can read consult_summaries" on consult_summaries;
drop policy if exists "authenticated can insert consult_summaries" on consult_summaries;
drop policy if exists "authenticated can update consult_summaries" on consult_summaries;
drop policy if exists "doctors can read consult_summaries" on consult_summaries;
drop policy if exists "doctors can insert consult_summaries" on consult_summaries;
drop policy if exists "doctors can update consult_summaries" on consult_summaries;

create policy "doctors can read consult_summaries" on consult_summaries
  for select to authenticated using (public.can_use_consult_chart());
create policy "doctors can insert consult_summaries" on consult_summaries
  for insert to authenticated with check (public.can_use_consult_chart());
create policy "doctors can update consult_summaries" on consult_summaries
  for update to authenticated using (public.can_use_consult_chart()) with check (public.can_use_consult_chart());
