# LabTrak Production RLS Rollout

The current single-file LabTrak app still uses the Supabase anon key plus
LabTrak PIN selection. That is useful for prototype testing, but database
enforcement needs Supabase Auth.

Use `supabase/migrations/20260616_production_rls.sql` after these steps:

1. Enable Supabase Auth for every LabTrak user.
2. Create one `public.st_user_profiles` row per Auth user:
   - `auth_user_id`: Supabase Auth user UUID
   - `app_user_id`: existing LabTrak `st_users.id` if available
   - `role`: `admin`, `section_admin`, `field`, `lab`, `concrete`, `hotmix`, `precast`, or `chemlab`
   - `can_approve_reports`: true for report approvers
   - Insert the first admin profile from the Supabase SQL editor/service role.
     After that, admin users can manage additional profiles.
3. Update the browser login flow to authenticate through Supabase Auth.
4. Apply the migration.
5. Test reads/writes by role before using production data.

What the migration enforces:

- `samples` and `projects` are no longer available to anonymous users.
- sample/project hard deletes are blocked by policy.
- project writes are limited to admin/section admin.
- sample writes are limited to operational roles.
- audit trail records are append-only.
- approved source edits are limited to admin/section admin/lab.
- concrete set writes are limited to admin/section admin/concrete.

Do not apply the migration before Supabase Auth is wired into the app, or the
current anon-key browser session will lose database access by design.
