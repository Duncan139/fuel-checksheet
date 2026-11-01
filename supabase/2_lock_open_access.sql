-- Stage 2 (go-live): remove the old open access so only signed-in crew can use the fuel records.
drop policy if exists "allow insert" on public.refuels;
drop policy if exists "allow select" on public.refuels;
drop policy if exists "allow update" on public.refuels;
revoke all on public.refuels from anon;
