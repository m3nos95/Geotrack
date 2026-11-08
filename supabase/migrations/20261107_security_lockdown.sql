-- LabTrak security lockdown. Run once in the Supabase SQL editor.
-- Signed-out visitors keep the public anon key, but they can no longer
-- read or change lab data. The Gmail app password is removed from shared
-- storage. ConTrak books are limited to the people who are supposed to see them.

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

-- Drop the old "anyone can do anything" policies, including ones that
-- were added again after the June production rules.
DO $$
DECLARE
  item text;
  tbl text;
  pol text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'st_user_profiles|labtrak_profiles_all',
    'projects|labtrak_projects_all',
    'projects|Allow all projects',
    'projects|projects anon legacy write',
    'samples|labtrak_samples_all',
    'samples|Allow all',
    'st_users|labtrak_st_users_all',
    'approved_sources|labtrak_approved_sources_all',
    'st_cal_notes|labtrak_st_cal_notes_all',
    'st_hub_notes|labtrak_st_hub_notes_all',
    'concrete_sets|labtrak_concrete_sets_all',
    'concrete_cylinders|labtrak_concrete_cylinders_all',
    'field_tests|labtrak_field_tests_all',
    'core_drills|labtrak_core_drills_all',
    'sample_history|labtrak_sample_history_all',
    'borelog_projects|labtrak_borelog_projects_all',
    'borelog_borings|labtrak_borelog_borings_all',
    'borelog_samples|labtrak_borelog_samples_all',
    'sos_letters|labtrak_sos_letters_all',
    'labtrak_shared|labtrak_shared_all',
    'lab_spec_config|lab_spec_config_read',
    'lab_spec_config|lab_spec_config_write',
    'contrak_access|contrak_access_all',
    'contrak_books|contrak_books_all'
  ]
  LOOP
    tbl := split_part(item, '|', 1);
    pol := split_part(item, '|', 2);
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END IF;
  END LOOP;
END $$;

-- Profiles: a person can read their own row. Only an admin can change roles.
ALTER TABLE public.st_user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles self read" ON public.st_user_profiles;
DROP POLICY IF EXISTS "profiles admin write" ON public.st_user_profiles;
CREATE POLICY "profiles self read" ON public.st_user_profiles
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.st_is_admin());
CREATE POLICY "profiles admin write" ON public.st_user_profiles
  FOR ALL TO authenticated
  USING (public.st_is_admin()) WITH CHECK (public.st_is_admin());

-- Lab specs, request tags, and approval routes. Signed-in staff only.
DO $$
BEGIN
  IF to_regclass('public.lab_spec_config') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lab_spec_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "lab_spec_config staff" ON public.lab_spec_config';
    EXECUTE $p$
      CREATE POLICY "lab_spec_config staff" ON public.lab_spec_config
        FOR ALL TO authenticated
        USING (
          public.st_current_role() IS NOT NULL
          AND public.st_current_role() NOT IN ('pm', 'supplier')
        )
        WITH CHECK (
          public.st_current_role() IS NOT NULL
          AND public.st_current_role() NOT IN ('pm', 'supplier')
        )
    $p$;
  END IF;
END $$;

-- Core drills. The open policy was left in place beside the staff policy.
DO $$
BEGIN
  IF to_regclass('public.core_drills') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.core_drills ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "core_drills authenticated read" ON public.core_drills';
    EXECUTE 'DROP POLICY IF EXISTS "core_drills field write" ON public.core_drills';
    EXECUTE 'DROP POLICY IF EXISTS "core_drills no hard delete" ON public.core_drills';
    EXECUTE 'CREATE POLICY "core_drills authenticated read" ON public.core_drills FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "core_drills field write" ON public.core_drills FOR INSERT TO authenticated WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "core_drills field update" ON public.core_drills FOR UPDATE TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "core_drills field delete" ON public.core_drills FOR DELETE TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
  END IF;
END $$;

-- Cylinder rows follow the same people who can save a concrete set.
DO $$
BEGIN
  IF to_regclass('public.concrete_cylinders') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.concrete_cylinders ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "concrete_cylinders authenticated read" ON public.concrete_cylinders';
    EXECUTE 'DROP POLICY IF EXISTS "concrete_cylinders concrete write" ON public.concrete_cylinders';
    EXECUTE 'CREATE POLICY "concrete_cylinders authenticated read" ON public.concrete_cylinders FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "concrete_cylinders concrete write" ON public.concrete_cylinders FOR ALL TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'', ''concrete'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'', ''concrete''))';
  END IF;
END $$;

-- Bore logs stay with signed-in field and lab staff.
DO $$
BEGIN
  IF to_regclass('public.borelog_projects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "borelog_projects authenticated read" ON public.borelog_projects';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_projects field lab write" ON public.borelog_projects';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_projects no hard delete" ON public.borelog_projects';
    EXECUTE 'CREATE POLICY "borelog_projects authenticated read" ON public.borelog_projects FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL AND public.st_current_role() NOT IN (''pm'', ''supplier''))';
    EXECUTE 'CREATE POLICY "borelog_projects field lab write" ON public.borelog_projects FOR INSERT TO authenticated WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_projects field lab update" ON public.borelog_projects FOR UPDATE TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_projects no hard delete" ON public.borelog_projects FOR DELETE TO authenticated USING (FALSE)';
  END IF;
  IF to_regclass('public.borelog_borings') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "borelog_borings authenticated read" ON public.borelog_borings';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_borings field lab write" ON public.borelog_borings';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_borings no hard delete" ON public.borelog_borings';
    EXECUTE 'CREATE POLICY "borelog_borings authenticated read" ON public.borelog_borings FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL AND public.st_current_role() NOT IN (''pm'', ''supplier''))';
    EXECUTE 'CREATE POLICY "borelog_borings field lab write" ON public.borelog_borings FOR INSERT TO authenticated WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_borings field lab update" ON public.borelog_borings FOR UPDATE TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_borings no hard delete" ON public.borelog_borings FOR DELETE TO authenticated USING (FALSE)';
  END IF;
  IF to_regclass('public.borelog_samples') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "borelog_samples authenticated read" ON public.borelog_samples';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_samples field lab write" ON public.borelog_samples';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_samples no hard delete" ON public.borelog_samples';
    EXECUTE 'CREATE POLICY "borelog_samples authenticated read" ON public.borelog_samples FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL AND public.st_current_role() NOT IN (''pm'', ''supplier''))';
    EXECUTE 'CREATE POLICY "borelog_samples field lab write" ON public.borelog_samples FOR INSERT TO authenticated WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_samples field lab update" ON public.borelog_samples FOR UPDATE TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_samples no hard delete" ON public.borelog_samples FOR DELETE TO authenticated USING (FALSE)';
  END IF;
END $$;

-- ConTrak: a person sees their own book, the books they were given,
-- or every book when they are a ConTrak admin.
CREATE OR REPLACE FUNCTION public.contrak_can_read_user(target TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.st_is_admin()
    OR (target IS NOT NULL AND target = public.st_app_user_id())
    OR EXISTS (
      SELECT 1 FROM public.contrak_access AS a
      WHERE a.user_id = public.st_app_user_id()
        AND (
          a.contrak_role = 'admin'
          OR a.contrak_scope = 'all'
          OR COALESCE(a.view_ids, '[]'::jsonb) ? target
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.contrak_can_write_access()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.st_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.contrak_access AS a
      WHERE a.user_id = public.st_app_user_id()
        AND a.contrak_role = 'admin'
    )
$$;

CREATE OR REPLACE FUNCTION public.contrak_can_write_book(target TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.st_is_admin()
    OR target = public.st_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.contrak_access AS a
      WHERE a.user_id = public.st_app_user_id()
        AND a.contrak_role = 'admin'
    )
$$;

DO $$
BEGIN
  IF to_regclass('public.contrak_access') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.contrak_access ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "contrak_access read" ON public.contrak_access';
    EXECUTE 'DROP POLICY IF EXISTS "contrak_access write" ON public.contrak_access';
    EXECUTE 'CREATE POLICY "contrak_access read" ON public.contrak_access FOR SELECT TO authenticated USING (public.contrak_can_read_user(user_id))';
    EXECUTE 'CREATE POLICY "contrak_access write" ON public.contrak_access FOR ALL TO authenticated USING (public.contrak_can_write_access()) WITH CHECK (public.contrak_can_write_access())';
  END IF;
  IF to_regclass('public.contrak_books') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.contrak_books ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "contrak_books read" ON public.contrak_books';
    EXECUTE 'DROP POLICY IF EXISTS "contrak_books insert" ON public.contrak_books';
    EXECUTE 'DROP POLICY IF EXISTS "contrak_books update" ON public.contrak_books';
    EXECUTE 'CREATE POLICY "contrak_books read" ON public.contrak_books FOR SELECT TO authenticated USING (public.contrak_can_read_user(user_id))';
    EXECUTE 'CREATE POLICY "contrak_books insert" ON public.contrak_books FOR INSERT TO authenticated WITH CHECK (public.contrak_can_write_book(user_id))';
    EXECUTE 'CREATE POLICY "contrak_books update" ON public.contrak_books FOR UPDATE TO authenticated USING (public.contrak_can_write_book(user_id)) WITH CHECK (public.contrak_can_write_book(user_id))';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.contrak_can_read_user(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contrak_can_write_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.contrak_can_write_book(TEXT) TO authenticated;

-- Never keep a Gmail app password in the shared office table.
CREATE OR REPLACE FUNCTION public.labtrak_shared_strip_mail_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id = 'gmail' AND NEW.payload ? 'appPassword' THEN
    NEW.payload := NEW.payload - 'appPassword';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labtrak_shared_strip_mail ON public.labtrak_shared;
CREATE TRIGGER trg_labtrak_shared_strip_mail
  BEFORE INSERT OR UPDATE ON public.labtrak_shared
  FOR EACH ROW EXECUTE FUNCTION public.labtrak_shared_strip_mail_secret();

UPDATE public.labtrak_shared
SET payload = payload - 'appPassword',
    updated_at = NOW()
WHERE id = 'gmail' AND payload ? 'appPassword';

-- The anon key stays in the web page. It must not be able to touch these tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects', 'samples', 'st_user_profiles', 'st_users', 'approved_sources',
    'st_cal_notes', 'st_hub_notes', 'concrete_sets', 'concrete_cylinders',
    'field_tests', 'core_drills', 'sample_history', 'borelog_projects',
    'borelog_borings', 'borelog_samples', 'sos_letters', 'labtrak_shared',
    'lab_spec_config', 'contrak_access', 'contrak_books', 'mix_designs'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
