-- LabTrak production RLS (optional — apply after Supabase Auth rollout)
--
-- The browser app currently uses the anon key + LabTrak PIN tiles. Do NOT apply
-- this migration until every user signs in through Supabase Auth and has a row
-- in public.st_user_profiles. See supabase/docs/production-rls-rollout.md.

-- ── Auth profile bridge ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.st_user_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id        UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  app_user_id         TEXT,
  display_name        TEXT,
  role                TEXT NOT NULL CHECK (role IN (
    'admin', 'section_admin', 'field', 'lab', 'concrete', 'hotmix', 'precast', 'chemlab'
  )),
  can_approve_reports BOOLEAN NOT NULL DEFAULT FALSE,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.st_user_profiles ENABLE ROW LEVEL SECURITY;

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

CREATE OR REPLACE FUNCTION public.st_can_approve_reports()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    public.st_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.st_user_profiles
      WHERE auth_user_id = auth.uid() AND active = TRUE AND can_approve_reports = TRUE
    ),
    FALSE
  )
$$;

DROP POLICY IF EXISTS "profiles self read"  ON public.st_user_profiles;
DROP POLICY IF EXISTS "profiles admin write" ON public.st_user_profiles;

CREATE POLICY "profiles self read" ON public.st_user_profiles
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.st_is_admin());

CREATE POLICY "profiles admin write" ON public.st_user_profiles
  FOR ALL TO authenticated
  USING (public.st_is_admin()) WITH CHECK (public.st_is_admin());

-- ── Drop starter open policies (schema.sql dev defaults) ───────
DROP POLICY IF EXISTS "labtrak_projects_all"         ON public.projects;
DROP POLICY IF EXISTS "labtrak_samples_all"          ON public.samples;
DROP POLICY IF EXISTS "labtrak_st_users_all"         ON public.st_users;
DROP POLICY IF EXISTS "labtrak_profiles_all"         ON public.st_user_profiles;
DROP POLICY IF EXISTS "labtrak_approved_sources_all" ON public.approved_sources;
DROP POLICY IF EXISTS "labtrak_st_cal_notes_all"     ON public.st_cal_notes;
DROP POLICY IF EXISTS "labtrak_st_hub_notes_all"     ON public.st_hub_notes;
DROP POLICY IF EXISTS "labtrak_concrete_sets_all"    ON public.concrete_sets;
DROP POLICY IF EXISTS "labtrak_field_tests_all"      ON public.field_tests;
DROP POLICY IF EXISTS "labtrak_sample_history_all"   ON public.sample_history;
DROP POLICY IF EXISTS "Allow all projects"           ON public.projects;
DROP POLICY IF EXISTS "Allow all"                    ON public.samples;

-- ── Projects ───────────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects authenticated read" ON public.projects;
DROP POLICY IF EXISTS "projects admin insert"       ON public.projects;
DROP POLICY IF EXISTS "projects admin update"       ON public.projects;
DROP POLICY IF EXISTS "projects no hard delete"     ON public.projects;

CREATE POLICY "projects authenticated read" ON public.projects
  FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL);
CREATE POLICY "projects admin insert" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (public.st_is_admin());
CREATE POLICY "projects admin update" ON public.projects
  FOR UPDATE TO authenticated USING (public.st_is_admin()) WITH CHECK (public.st_is_admin());
CREATE POLICY "projects no hard delete" ON public.projects
  FOR DELETE TO authenticated USING (FALSE);

-- ── Samples (soft-delete via deleted_at; no hard DELETE) ───────
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "samples authenticated read" ON public.samples;
DROP POLICY IF EXISTS "samples role insert"        ON public.samples;
DROP POLICY IF EXISTS "samples role update"        ON public.samples;
DROP POLICY IF EXISTS "samples no hard delete"       ON public.samples;

CREATE POLICY "samples authenticated read" ON public.samples
  FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL);
CREATE POLICY "samples role insert" ON public.samples
  FOR INSERT TO authenticated
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab', 'concrete'));
CREATE POLICY "samples role update" ON public.samples
  FOR UPDATE TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab', 'concrete'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab', 'concrete'));
CREATE POLICY "samples no hard delete" ON public.samples
  FOR DELETE TO authenticated USING (FALSE);

-- ── Field tests (density / nuclear — field workflow) ───────────
ALTER TABLE public.field_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "field_tests authenticated read" ON public.field_tests;
DROP POLICY IF EXISTS "field_tests field write"      ON public.field_tests;
DROP POLICY IF EXISTS "field_tests no hard delete"   ON public.field_tests;

CREATE POLICY "field_tests authenticated read" ON public.field_tests
  FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL);
CREATE POLICY "field_tests field write" ON public.field_tests
  FOR ALL TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'field'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field'));
CREATE POLICY "field_tests no hard delete" ON public.field_tests
  FOR DELETE TO authenticated USING (public.st_is_admin());

-- ── Sample history (append-only audit) ─────────────────────────
ALTER TABLE public.sample_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sample_history authenticated read"  ON public.sample_history;
DROP POLICY IF EXISTS "sample_history authenticated insert" ON public.sample_history;
DROP POLICY IF EXISTS "sample_history no update"           ON public.sample_history;
DROP POLICY IF EXISTS "sample_history no delete"           ON public.sample_history;

CREATE POLICY "sample_history authenticated read" ON public.sample_history
  FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL);
CREATE POLICY "sample_history authenticated insert" ON public.sample_history
  FOR INSERT TO authenticated WITH CHECK (public.st_current_role() IS NOT NULL);
CREATE POLICY "sample_history no update" ON public.sample_history
  FOR UPDATE TO authenticated USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "sample_history no delete" ON public.sample_history
  FOR DELETE TO authenticated USING (FALSE);

-- ── Optional / module tables ───────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.approved_sources') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.approved_sources ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "approved_sources authenticated read" ON public.approved_sources';
    EXECUTE 'DROP POLICY IF EXISTS "approved_sources lab admin write" ON public.approved_sources';
    EXECUTE 'CREATE POLICY "approved_sources authenticated read" ON public.approved_sources FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "approved_sources lab admin write" ON public.approved_sources FOR ALL TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''lab'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''lab''))';
  END IF;

  IF to_regclass('public.concrete_sets') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.concrete_sets ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "concrete_sets authenticated read" ON public.concrete_sets';
    EXECUTE 'DROP POLICY IF EXISTS "concrete_sets concrete write" ON public.concrete_sets';
    EXECUTE 'CREATE POLICY "concrete_sets authenticated read" ON public.concrete_sets FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "concrete_sets concrete write" ON public.concrete_sets FOR ALL TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''concrete'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''concrete''))';
  END IF;

  IF to_regclass('public.st_cal_notes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.st_cal_notes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "st_cal_notes authenticated read" ON public.st_cal_notes';
    EXECUTE 'DROP POLICY IF EXISTS "st_cal_notes authenticated write" ON public.st_cal_notes';
    EXECUTE 'CREATE POLICY "st_cal_notes authenticated read" ON public.st_cal_notes FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "st_cal_notes authenticated write" ON public.st_cal_notes FOR ALL TO authenticated USING (public.st_current_role() IS NOT NULL) WITH CHECK (public.st_current_role() IS NOT NULL)';
  END IF;

  IF to_regclass('public.st_hub_notes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.st_hub_notes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "st_hub_notes authenticated read" ON public.st_hub_notes';
    EXECUTE 'DROP POLICY IF EXISTS "st_hub_notes authenticated write" ON public.st_hub_notes';
    EXECUTE 'CREATE POLICY "st_hub_notes authenticated read" ON public.st_hub_notes FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "st_hub_notes authenticated write" ON public.st_hub_notes FOR ALL TO authenticated USING (public.st_current_role() IS NOT NULL) WITH CHECK (public.st_current_role() IS NOT NULL)';
  END IF;

  IF to_regclass('public.st_users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.st_users ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "st_users authenticated read" ON public.st_users';
    EXECUTE 'DROP POLICY IF EXISTS "st_users admin write" ON public.st_users';
    EXECUTE 'CREATE POLICY "st_users authenticated read" ON public.st_users FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "st_users admin write" ON public.st_users FOR ALL TO authenticated USING (public.st_is_admin()) WITH CHECK (public.st_is_admin())';
  END IF;
END $$;
