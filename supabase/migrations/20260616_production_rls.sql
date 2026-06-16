-- LabTrak production RLS foundation
--
-- Apply this only after Supabase Auth is enabled and each Auth user has a row
-- in public.st_user_profiles. The current single-file prototype uses the anon
-- key and client-side PINs, so applying this migration before Auth rollout will
-- intentionally block unauthenticated browser writes.

create table if not exists public.st_user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  app_user_id text,
  display_name text,
  role text not null check (role in ('admin', 'section_admin', 'field', 'lab', 'concrete', 'hotmix', 'precast', 'chemlab')),
  can_approve_reports boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.st_user_profiles enable row level security;

create or replace function public.st_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.st_user_profiles
  where auth_user_id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.st_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.st_current_role() in ('admin', 'section_admin'), false)
$$;

create or replace function public.st_can_approve_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.st_is_admin()
    or exists (
      select 1
      from public.st_user_profiles
      where auth_user_id = auth.uid()
        and active = true
        and can_approve_reports = true
    ),
    false
  )
$$;

drop policy if exists "profiles self read" on public.st_user_profiles;
drop policy if exists "profiles admin write" on public.st_user_profiles;

create policy "profiles self read"
on public.st_user_profiles
for select
to authenticated
using (auth_user_id = auth.uid() or public.st_is_admin());

create policy "profiles admin write"
on public.st_user_profiles
for all
to authenticated
using (public.st_is_admin())
with check (public.st_is_admin());

-- Core project records
alter table public.projects enable row level security;
drop policy if exists "Allow all projects" on public.projects;
drop policy if exists "projects authenticated read" on public.projects;
drop policy if exists "projects admin insert" on public.projects;
drop policy if exists "projects admin update" on public.projects;
drop policy if exists "projects no hard delete" on public.projects;

create policy "projects authenticated read"
on public.projects
for select
to authenticated
using (public.st_current_role() is not null);

create policy "projects admin insert"
on public.projects
for insert
to authenticated
with check (public.st_is_admin());

create policy "projects admin update"
on public.projects
for update
to authenticated
using (public.st_is_admin())
with check (public.st_is_admin());

create policy "projects no hard delete"
on public.projects
for delete
to authenticated
using (false);

-- Sample records. Hard deletes remain blocked; archive/delete flows use flags.
alter table public.samples enable row level security;
drop policy if exists "Allow all" on public.samples;
drop policy if exists "samples authenticated read" on public.samples;
drop policy if exists "samples role insert" on public.samples;
drop policy if exists "samples role update" on public.samples;
drop policy if exists "samples no hard delete" on public.samples;

create policy "samples authenticated read"
on public.samples
for select
to authenticated
using (public.st_current_role() is not null);

create policy "samples role insert"
on public.samples
for insert
to authenticated
with check (public.st_current_role() in ('admin', 'section_admin', 'field', 'lab', 'concrete'));

create policy "samples role update"
on public.samples
for update
to authenticated
using (public.st_current_role() in ('admin', 'section_admin', 'field', 'lab', 'concrete'))
with check (public.st_current_role() in ('admin', 'section_admin', 'field', 'lab', 'concrete'));

create policy "samples no hard delete"
on public.samples
for delete
to authenticated
using (false);

-- Audit trail: immutable append-only events.
create table if not exists public.st_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text,
  action text not null,
  summary text,
  metadata jsonb default '{}'::jsonb,
  actor_id text,
  actor_name text,
  actor_role text,
  created_at timestamptz default now()
);

create index if not exists st_audit_log_entity_idx
on public.st_audit_log(entity_type, entity_id, created_at desc);

alter table public.st_audit_log enable row level security;
drop policy if exists "Allow audit read" on public.st_audit_log;
drop policy if exists "Allow audit insert" on public.st_audit_log;
drop policy if exists "audit authenticated read" on public.st_audit_log;
drop policy if exists "audit authenticated insert" on public.st_audit_log;
drop policy if exists "audit no update" on public.st_audit_log;
drop policy if exists "audit no delete" on public.st_audit_log;

create policy "audit authenticated read"
on public.st_audit_log
for select
to authenticated
using (public.st_current_role() is not null);

create policy "audit authenticated insert"
on public.st_audit_log
for insert
to authenticated
with check (public.st_current_role() is not null);

create policy "audit no update"
on public.st_audit_log
for update
to authenticated
using (false)
with check (false);

create policy "audit no delete"
on public.st_audit_log
for delete
to authenticated
using (false);

-- Optional tables used by richer modules. These blocks are safe to skip when a
-- table has not been created in a particular deployment.
do $$
begin
  if to_regclass('public.approved_sources') is not null then
    execute 'alter table public.approved_sources enable row level security';
    execute 'drop policy if exists "approved_sources authenticated read" on public.approved_sources';
    execute 'drop policy if exists "approved_sources lab admin write" on public.approved_sources';
    execute 'create policy "approved_sources authenticated read" on public.approved_sources for select to authenticated using (public.st_current_role() is not null)';
    execute 'create policy "approved_sources lab admin write" on public.approved_sources for all to authenticated using (public.st_current_role() in (''admin'', ''section_admin'', ''lab'')) with check (public.st_current_role() in (''admin'', ''section_admin'', ''lab''))';
  end if;

  if to_regclass('public.concrete_sets') is not null then
    execute 'alter table public.concrete_sets enable row level security';
    execute 'drop policy if exists "concrete_sets authenticated read" on public.concrete_sets';
    execute 'drop policy if exists "concrete_sets concrete write" on public.concrete_sets';
    execute 'create policy "concrete_sets authenticated read" on public.concrete_sets for select to authenticated using (public.st_current_role() is not null)';
    execute 'create policy "concrete_sets concrete write" on public.concrete_sets for all to authenticated using (public.st_current_role() in (''admin'', ''section_admin'', ''concrete'')) with check (public.st_current_role() in (''admin'', ''section_admin'', ''concrete''))';
  end if;
end $$;
