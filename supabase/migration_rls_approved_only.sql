-- Row-level security: approved staff only.
--
-- WHY: most data tables were guarded only by `auth.role() = 'authenticated'`.
-- Anyone can sign up through /signup, and a signed-up but not-yet-approved
-- (status = 'pending') account is still an 'authenticated' Supabase user, so
-- with the public anon key it could read and write patient data (happy-call
-- patients, prescriptions, revenue, consult transcripts, ...) directly through
-- PostgREST, bypassing the pending-approval screen in the app (that gate lives
-- only in the Next.js proxy/middleware).
--
-- Fix: every data policy now requires public.is_approved_staff(). Policy names,
-- commands and extra conditions are unchanged; only the "who may" check is
-- replaced. Policies are also scoped `to authenticated` so anonymous requests
-- simply get no rows instead of evaluating the function.
--
-- The chat tables already check staff.status = 'approved' and the supply_requests
-- delete rule and guard trigger have their own owner conditions -- they are
-- left as they are. prescriptions / daily_records / reservations /
-- monthly_goals belong to another app sharing this database and are NOT touched.
--
-- Idempotent: safe to re-run.

-- 1) Helper: is the caller an approved staff member?
--    SECURITY DEFINER so it can read staff regardless of the staff RLS policy
--    (which itself calls it -- no recursion, because the function bypasses RLS).
create or replace function public.is_approved_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff where id = auth.uid() and status = 'approved'
  )
$$;

revoke all on function public.is_approved_staff() from public, anon;
grant execute on function public.is_approved_staff() to authenticated;

-- 2) staff: a pending user must still read their OWN row (the pending-approval
--    gate in src/lib/supabase/middleware.ts needs it) but not everyone else's.
--    The UPDATE policy and the column-level grant update (name) stay as they are.
drop policy if exists "authenticated can read staff" on staff;
create policy "authenticated can read staff" on staff
  for select to authenticated using (auth.uid() = id or public.is_approved_staff());

-- 3) Data tables.
-- happy_call_patients
drop policy if exists "authenticated can insert happy_call_patients" on happy_call_patients;
create policy "authenticated can insert happy_call_patients" on happy_call_patients
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read happy_call_patients" on happy_call_patients;
create policy "authenticated can read happy_call_patients" on happy_call_patients
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update happy_call_patients" on happy_call_patients;
create policy "authenticated can update happy_call_patients" on happy_call_patients
  for update to authenticated using (public.is_approved_staff());

-- herb_medicine_prescriptions
drop policy if exists "authenticated can insert herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can insert herb_medicine_prescriptions" on herb_medicine_prescriptions
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can read herb_medicine_prescriptions" on herb_medicine_prescriptions
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can update herb_medicine_prescriptions" on herb_medicine_prescriptions
  for update to authenticated using (public.is_approved_staff());

-- diet_packages
drop policy if exists "authenticated can insert diet_packages" on diet_packages;
create policy "authenticated can insert diet_packages" on diet_packages
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read diet_packages" on diet_packages;
create policy "authenticated can read diet_packages" on diet_packages
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update diet_packages" on diet_packages;
create policy "authenticated can update diet_packages" on diet_packages
  for update to authenticated using (public.is_approved_staff());

-- diet_package_calls
drop policy if exists "authenticated can insert diet_package_calls" on diet_package_calls;
create policy "authenticated can insert diet_package_calls" on diet_package_calls
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read diet_package_calls" on diet_package_calls;
create policy "authenticated can read diet_package_calls" on diet_package_calls
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update diet_package_calls" on diet_package_calls;
create policy "authenticated can update diet_package_calls" on diet_package_calls
  for update to authenticated using (public.is_approved_staff());

-- happy_call_manual_entries
drop policy if exists "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can read happy_call_manual_entries" on happy_call_manual_entries
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can update happy_call_manual_entries" on happy_call_manual_entries
  for update to authenticated using (public.is_approved_staff());

-- herb_inventory
drop policy if exists "authenticated can delete herb_inventory" on herb_inventory;
create policy "authenticated can delete herb_inventory" on herb_inventory
  for delete to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert herb_inventory" on herb_inventory;
create policy "authenticated can insert herb_inventory" on herb_inventory
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read herb_inventory" on herb_inventory;
create policy "authenticated can read herb_inventory" on herb_inventory
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update herb_inventory" on herb_inventory;
create policy "authenticated can update herb_inventory" on herb_inventory
  for update to authenticated using (public.is_approved_staff());

-- herb_inventory_logs
drop policy if exists "authenticated can insert herb_inventory_logs" on herb_inventory_logs;
create policy "authenticated can insert herb_inventory_logs" on herb_inventory_logs
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read herb_inventory_logs" on herb_inventory_logs;
create policy "authenticated can read herb_inventory_logs" on herb_inventory_logs
  for select to authenticated using (public.is_approved_staff());

-- non_covered_purchases
drop policy if exists "authenticated can delete non_covered_purchases" on non_covered_purchases;
create policy "authenticated can delete non_covered_purchases" on non_covered_purchases
  for delete to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert non_covered_purchases" on non_covered_purchases;
create policy "authenticated can insert non_covered_purchases" on non_covered_purchases
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read non_covered_purchases" on non_covered_purchases;
create policy "authenticated can read non_covered_purchases" on non_covered_purchases
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update non_covered_purchases" on non_covered_purchases;
create policy "authenticated can update non_covered_purchases" on non_covered_purchases
  for update to authenticated using (public.is_approved_staff());

-- non_covered_products
drop policy if exists "authenticated can delete non_covered_products" on non_covered_products;
create policy "authenticated can delete non_covered_products" on non_covered_products
  for delete to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert non_covered_products" on non_covered_products;
create policy "authenticated can insert non_covered_products" on non_covered_products
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read non_covered_products" on non_covered_products;
create policy "authenticated can read non_covered_products" on non_covered_products
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update non_covered_products" on non_covered_products;
create policy "authenticated can update non_covered_products" on non_covered_products
  for update to authenticated using (public.is_approved_staff());

-- daily_revenue
drop policy if exists "authenticated can delete daily_revenue" on daily_revenue;
create policy "authenticated can delete daily_revenue" on daily_revenue
  for delete to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert daily_revenue" on daily_revenue;
create policy "authenticated can insert daily_revenue" on daily_revenue
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read daily_revenue" on daily_revenue;
create policy "authenticated can read daily_revenue" on daily_revenue
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update daily_revenue" on daily_revenue;
create policy "authenticated can update daily_revenue" on daily_revenue
  for update to authenticated using (public.is_approved_staff());

-- monthly_revenue_override
drop policy if exists "authenticated can insert monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can insert monthly_revenue_override" on monthly_revenue_override
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can read monthly_revenue_override" on monthly_revenue_override
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update monthly_revenue_override" on monthly_revenue_override;
create policy "authenticated can update monthly_revenue_override" on monthly_revenue_override
  for update to authenticated using (public.is_approved_staff());

-- consult_summaries
drop policy if exists "authenticated can insert consult_summaries" on consult_summaries;
create policy "authenticated can insert consult_summaries" on consult_summaries
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read consult_summaries" on consult_summaries;
create policy "authenticated can read consult_summaries" on consult_summaries
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update consult_summaries" on consult_summaries;
create policy "authenticated can update consult_summaries" on consult_summaries
  for update to authenticated using (public.is_approved_staff());

-- todos
drop policy if exists "authenticated can delete todos" on todos;
create policy "authenticated can delete todos" on todos
  for delete to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert todos" on todos;
create policy "authenticated can insert todos" on todos
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read todos" on todos;
create policy "authenticated can read todos" on todos
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update todos" on todos;
create policy "authenticated can update todos" on todos
  for update to authenticated using (public.is_approved_staff());

-- supply_items
drop policy if exists "authenticated can delete supply_items" on supply_items;
create policy "authenticated can delete supply_items" on supply_items
  for delete to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can insert supply_items" on supply_items;
create policy "authenticated can insert supply_items" on supply_items
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read supply_items" on supply_items;
create policy "authenticated can read supply_items" on supply_items
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update supply_items" on supply_items;
create policy "authenticated can update supply_items" on supply_items
  for update to authenticated using (public.is_approved_staff());

-- supply_requests
drop policy if exists "authenticated can insert supply_requests" on supply_requests;
create policy "authenticated can insert supply_requests" on supply_requests
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "authenticated can read supply_requests" on supply_requests;
create policy "authenticated can read supply_requests" on supply_requests
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update supply_requests" on supply_requests;
create policy "authenticated can update supply_requests" on supply_requests
  for update to authenticated using (public.is_approved_staff());

-- (kept as-is, no auth.role check) owner or own pending can delete supply_requests

-- 4) Storage bucket chat-attachments (chat_attachments / chat_* tables already
--    require approved staff in their own policies).
drop policy if exists "authenticated can upload chat attachments" on storage.objects;
create policy "authenticated can upload chat attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-attachments' and public.is_approved_staff());

drop policy if exists "authenticated can view chat attachments" on storage.objects;
create policy "authenticated can view chat attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-attachments' and public.is_approved_staff());

-- 5) Safeguard: fail (and roll back, when run as one script) if any policy on
--    these tables still relies on the loose `auth.role()` check.
do $$
declare
  leftovers text;
begin
  select string_agg(schemaname || '.' || tablename || ': ' || policyname, '; ')
    into leftovers
  from pg_policies
  where (
      (schemaname = 'public' and tablename in (
        'staff', 'happy_call_patients', 'herb_medicine_prescriptions', 'diet_packages',
        'diet_package_calls', 'happy_call_manual_entries', 'herb_inventory',
        'herb_inventory_logs', 'non_covered_purchases', 'non_covered_products',
        'daily_revenue', 'monthly_revenue_override', 'consult_summaries', 'todos',
        'supply_items', 'supply_requests'))
      or (schemaname = 'storage' and tablename = 'objects'
          and policyname in ('authenticated can upload chat attachments',
                             'authenticated can view chat attachments'))
    )
    and (coalesce(qual, '') like '%auth.role()%' or coalesce(with_check, '') like '%auth.role()%');

  if leftovers is not null then
    raise exception 'Policies still using auth.role(): %', leftovers;
  end if;
end $$;
