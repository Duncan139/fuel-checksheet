-- Fuel Quantity Checksheet: require sign-in, crew allowlist, editors-only report.
-- Stage 1, applied 2026-11-02 (additive: old open access still works until stage 2).

-- 1. Crew allowlist (scheduler editors are always allowed too)
create table if not exists public.fuel_crew (
  email      text primary key,
  name       text,
  added_at   timestamptz not null default now(),
  added_by   text default auth.email()
);
alter table public.fuel_crew enable row level security;

create or replace function public.fuel_is_editor() returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.editors e where lower(e.email) = lower(auth.email()));
$$;

create or replace function public.fuel_is_crew() returns boolean
language sql stable security invoker set search_path = public as $$
  select public.fuel_is_editor()
      or exists (select 1 from public.fuel_crew c where lower(c.email) = lower(auth.email()));
$$;

revoke execute on function public.fuel_is_editor() from anon;
revoke execute on function public.fuel_is_crew() from anon;

drop policy if exists "crew read own entry, editors read all" on public.fuel_crew;
create policy "crew read own entry, editors read all" on public.fuel_crew
  for select to authenticated
  using (lower(email) = lower(auth.email()) or public.fuel_is_editor());

drop policy if exists "editors add crew" on public.fuel_crew;
create policy "editors add crew" on public.fuel_crew
  for insert to authenticated with check (public.fuel_is_editor());

drop policy if exists "editors update crew" on public.fuel_crew;
create policy "editors update crew" on public.fuel_crew
  for update to authenticated using (public.fuel_is_editor()) with check (public.fuel_is_editor());

drop policy if exists "editors remove crew" on public.fuel_crew;
create policy "editors remove crew" on public.fuel_crew
  for delete to authenticated using (public.fuel_is_editor());

-- 2. Stamp every refuel with who entered it
alter table public.refuels add column if not exists entered_by uuid default auth.uid();
alter table public.refuels add column if not exists entered_by_email text default auth.email();
alter table public.refuels alter column created_at set default now();

-- 3. Signed-in access (old open access is removed separately in 2_lock_open_access.sql)

-- Crew can add their own entries
create policy "crew insert own refuels" on public.refuels
  for insert to authenticated
  with check (public.fuel_is_crew() and entered_by = auth.uid());

-- Crew see only their own entries (needed to sync edits); editors see everything (the report)
create policy "own refuels or editors read all" on public.refuels
  for select to authenticated
  using (entered_by = auth.uid() or public.fuel_is_editor());

-- Crew can correct their own entry for 24 hours (the sheet itself locks a row 1 hour after it is complete)
create policy "crew correct own recent refuels" on public.refuels
  for update to authenticated
  using (entered_by = auth.uid() and created_at > now() - interval '24 hours')
  with check (entered_by = auth.uid() and public.fuel_is_crew());

-- No delete policy: nobody can delete a refuel record from the app.

revoke all on public.fuel_crew from anon;
grant select, insert, update on public.refuels to authenticated;
grant select, insert, update, delete on public.fuel_crew to authenticated;
