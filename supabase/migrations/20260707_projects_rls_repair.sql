-- Repair project RLS policies (idempotent).
-- Run in Supabase SQL Editor if project save fails with row-level security errors.
--
-- Production: requires Supabase Auth + st_user_profiles.role = admin or section_admin.
-- Legacy bridge: optional anon policy for PIN-only deployments still on the anon key.

-- Ensure helper functions exist (from production RLS migration)
CREATE OR REPLACE FUNCTION public.st_current_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.st_user_profiles
  WHERE auth_user_id = auth.uid() AND active = TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.st_is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.st_current_role() IN ('admin', 'section_admin'), FALSE)
$$;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects authenticated read" ON public.projects;
DROP POLICY IF EXISTS "projects admin insert"       ON public.projects;
DROP POLICY IF EXISTS "projects admin update"       ON public.projects;
DROP POLICY IF EXISTS "projects no hard delete"     ON public.projects;
DROP POLICY IF EXISTS "labtrak_projects_all"        ON public.projects;
DROP POLICY IF EXISTS "Allow all projects"          ON public.projects;
DROP POLICY IF EXISTS "projects anon legacy write"  ON public.projects;

CREATE POLICY "projects authenticated read" ON public.projects
  FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL);

CREATE POLICY "projects admin insert" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (public.st_is_admin());

CREATE POLICY "projects admin update" ON public.projects
  FOR UPDATE TO authenticated USING (public.st_is_admin()) WITH CHECK (public.st_is_admin());

CREATE POLICY "projects no hard delete" ON public.projects
  FOR DELETE TO authenticated USING (FALSE);

-- OPTIONAL legacy bridge: uncomment ONLY if your lab still uses PIN tiles without Supabase Auth
-- CREATE POLICY "projects anon legacy write" ON public.projects
--   FOR ALL TO anon USING (true) WITH CHECK (true);
