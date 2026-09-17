create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

alter table staff enable row level security;

-- Every logged-in user can see the staff list (used to render names in the UI).
-- This is safe: anon (not-logged-in) requests are rejected by auth.role() != 'authenticated',
-- and there is no public anon-key-only access path in this app (unlike dest-auto, this
-- app has real Supabase Auth sessions, so RLS scoped to `authenticated` is the correct,
-- standard pattern — not a shortcut).
create policy "authenticated can read staff" on staff
  for select using (auth.role() = 'authenticated');

-- Users can only edit their own row (e.g. changing their own display name later).
-- Row creation is NOT exposed here — the two initial owner accounts are seeded once,
-- out-of-band, via the Supabase Auth Admin API (see the plan's Prerequisites section).
create policy "users can update own staff row" on staff
  for update using (auth.uid() = id);
