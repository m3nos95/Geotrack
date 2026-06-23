# LabTrak Production RLS Rollout

The current single-file LabTrak app uses the **Supabase anon key** plus **LabTrak PIN tiles** (`st_users`). That works for development, but database enforcement requires **Supabase Auth**.

Use `supabase/migrations/20260617_production_rls.sql` only after these steps:

1. Enable Supabase Auth for every LabTrak user (email/password or SSO).
2. Create one `public.st_user_profiles` row per Auth user:
   - `auth_user_id` — Supabase Auth user UUID
   - `app_user_id` — existing LabTrak `st_users.id` if available
   - `role` — `admin`, `section_admin`, `field`, `lab`, `concrete`, `hotmix`, `precast`, or `chemlab`
   - `can_approve_reports` — `true` for report approvers
   - Seed the first admin profile from the SQL editor (service role) before locking down policies.
3. Update the browser login flow to authenticate through Supabase Auth (PIN can remain as a second factor or be replaced).
4. Apply the migration in the Supabase SQL editor.
5. Test reads/writes by role before using production data.

## What the migration enforces

- Anonymous (`anon`) access to core tables is removed.
- `samples` and `projects` hard deletes are blocked — use `deleted_at` / `archived` flags.
- Project writes are limited to admin / section admin.
- Sample writes are limited to operational roles (`field`, `lab`, `concrete`, etc.).
- `field_tests` writes are limited to field roles; hard delete only for admins.
- `sample_history` is append-only.
- `concrete_sets`, `approved_sources`, calendar/hub notes, and `st_users` follow role-scoped policies.

## Do not apply early

Applying this migration **before** Supabase Auth is wired into the app will block the current anon-key browser session by design.

For now, use **Settings → Data Maintenance** in the app to clean up legacy orphan sample stubs without changing RLS.
