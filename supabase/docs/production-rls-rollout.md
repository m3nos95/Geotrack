# LabTrak Production RLS Rollout

The single-file LabTrak app supports two sign-in modes:

| Mode | Settings value | Behavior |
|------|----------------|----------|
| **Legacy** | `Legacy — PIN tiles only` | Anon key + lab/user PIN tiles (development) |
| **Auto** | `Auto — detect from database` | PIN tiles until RLS blocks anon reads, then email/password |
| **Required** | `Required — always use email/password` | Supabase Auth only (production) |

Use `supabase/migrations/20260617_production_rls.sql` only after every user can sign in through Supabase Auth and has a row in `public.st_user_profiles`.

## Rollout checklist

### 1. Database prep (safe anytime)

Run the `st_user_profiles` section from `supabase/schema.sql` if the table does not exist yet (included in the main schema).

### 2. Create Supabase Auth users

In **Supabase Dashboard → Authentication → Users**, create one account per LabTrak user (email + password).

Recommended Auth settings for internal lab use:

- Disable public sign-ups (only admins create users)
- Disable email confirmation if you want instant password login (or keep it on and have users confirm first)

### 3. Link profiles (`st_user_profiles`)

Each Auth user needs one profile row:

| Column | Value |
|--------|--------|
| `auth_user_id` | UUID from `auth.users` |
| `app_user_id` | Existing `st_users.id` (optional — preserves PIN, initials, hub restrictions) |
| `display_name` | Shown in the app |
| `role` | `admin`, `section_admin`, `field`, `lab`, `concrete`, `hotmix`, `precast`, or `chemlab` |
| `can_approve_reports` | `true` for report approvers |

**Example (SQL editor, service role):**

```sql
INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES (
  '00000000-0000-0000-0000-000000000001',  -- from auth.users
  'default-admin',                          -- optional st_users.id
  'Administrator',
  'admin',
  true
);
```

**In the app (admin, before RLS lockdown):** Settings → **Provision sign-in** — paste the Auth user UUID and link to a LabTrak user.

Seed the first admin profile **before** applying production RLS.

### 4. App sign-in mode

In **Settings → Supabase Auth**:

- Use **Required** when you are ready for production-only sign-in
- Use **Auto** during transition (switches when anon reads are blocked)

Users sign in with **email + password**. If the linked `st_users` row has a PIN, it is still asked as a second step.

### 5. Apply production RLS

Run `supabase/migrations/20260617_production_rls.sql` in the Supabase SQL editor.

### 6. Verify by role

| Role | Should read | Should write |
|------|-------------|--------------|
| `field` | samples, field_tests | samples, field_tests |
| `lab` | samples, approved_sources | samples |
| `admin` | all | projects, st_users, profiles |
| All | — | no hard DELETE on samples/projects |

## What the migration enforces

- Anonymous (`anon`) access to core tables is removed.
- `samples` and `projects` hard deletes are blocked — use `deleted_at` / `archived` flags.
- Project writes are limited to admin / section admin.
- Sample writes are limited to operational roles (`field`, `lab`, `concrete`, etc.).
- `field_tests` writes are limited to field roles; hard delete only for admins.
- `sample_history` is append-only.
- `concrete_sets`, `approved_sources`, calendar/hub notes, `st_users`, and `st_user_profiles` follow role-scoped policies.

## Do not apply RLS early

Applying the migration **before** Supabase Auth and profiles are wired in will block the current anon-key browser session by design.

For legacy cleanup without RLS, use **Settings → Data Maintenance** to soft-delete orphan sample stubs.
