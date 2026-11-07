-- Project manager portal.
-- Run once in the Supabase SQL editor.
-- Adds the pm role, keeps project_manager on projects, and lets a signed-in
-- project manager read only the projects linked to their LabTrak id.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_manager TEXT;

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'st_user_profiles'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.st_user_profiles DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE public.st_user_profiles
  ADD CONSTRAINT st_user_profiles_role_check
  CHECK (role IN (
    'admin', 'section_admin', 'field', 'lab', 'concrete',
    'hotmix', 'precast', 'chemlab', 'supplier', 'pm'
  ));

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

CREATE OR REPLACE FUNCTION public.st_app_user_id()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT app_user_id FROM public.st_user_profiles
  WHERE auth_user_id = auth.uid() AND active = TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.st_profile_name()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT display_name FROM public.st_user_profiles
  WHERE auth_user_id = auth.uid() AND active = TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.project_visible_to_current_pm(manager TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.st_current_role() = 'pm'
    AND manager IS NOT NULL
    AND btrim(manager) <> ''
    AND (
      manager = public.st_app_user_id()
      OR lower(btrim(manager)) = lower(btrim(COALESCE(public.st_profile_name(), '')))
    )
$$;

GRANT EXECUTE ON FUNCTION public.st_app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.st_profile_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_visible_to_current_pm(TEXT) TO authenticated;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects authenticated read" ON public.projects;
DROP POLICY IF EXISTS "projects admin insert"       ON public.projects;
DROP POLICY IF EXISTS "projects admin update"       ON public.projects;
DROP POLICY IF EXISTS "projects no hard delete"     ON public.projects;
DROP POLICY IF EXISTS "labtrak_projects_all"        ON public.projects;
DROP POLICY IF EXISTS "Allow all projects"          ON public.projects;
DROP POLICY IF EXISTS "projects anon legacy write"  ON public.projects;

CREATE POLICY "projects authenticated read" ON public.projects
  FOR SELECT TO authenticated USING (
    public.st_current_role() IS NOT NULL
    AND (
      public.st_current_role() <> 'pm'
      OR public.project_visible_to_current_pm(project_manager)
    )
  );

CREATE POLICY "projects admin insert" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (public.st_is_admin());

CREATE POLICY "projects admin update" ON public.projects
  FOR UPDATE TO authenticated USING (public.st_is_admin()) WITH CHECK (public.st_is_admin());

CREATE POLICY "projects no hard delete" ON public.projects
  FOR DELETE TO authenticated USING (FALSE);

DROP POLICY IF EXISTS "samples pm read" ON public.samples;
CREATE POLICY "samples pm read" ON public.samples
  FOR SELECT TO authenticated USING (
    public.st_current_role() = 'pm'
    AND contract IN (
      SELECT p.contract
      FROM public.projects p
      WHERE p.deleted_at IS NULL
        AND public.project_visible_to_current_pm(p.project_manager)
    )
  );
