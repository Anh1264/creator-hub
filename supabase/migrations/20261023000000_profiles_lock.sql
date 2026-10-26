-- Creator Hub — security fix: users could make themselves admin
-- Run in Supabase → SQL Editor. Safe to run more than once; changes no data.
--
-- Supabase grants ALL on every new table in public to anon and authenticated (default privileges). A
-- table-level UPDATE overrides column-level grants, so the `grant update (display_name, program_tags_seeded)`
-- in 20261014000000_workspace.sql didn't restrict anything: a signed-in user could call the REST API with
-- their own session and set is_admin = true on their profile (row level security only checks it's their row).
-- Revoke the table-level rights, then grant back only the columns users may change.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke select on public.profiles from anon;
grant update (display_name, program_tags_seeded) on public.profiles to authenticated;

-- invites has row level security with no policies (service role only); drop the unused grants too.
revoke all on public.invites from anon, authenticated;
