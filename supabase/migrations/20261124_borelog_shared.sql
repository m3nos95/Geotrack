-- BoreLog shared data. Run once in the Supabase SQL editor.
-- Projects, borings, samples, archive (archived_at), and soft-delete (deleted_at)
-- live here. This is the copy that counts for every device and every LabTrak login.
-- Browser storage is only a cache of the open projects.
-- GeoTrak reference layers are not stored here. They stay on Google Drive.
-- Safe to run again. Existing rows are kept.

CREATE TABLE IF NOT EXISTS public.borelog_projects (
  id                  TEXT PRIMARY KEY,
  labtrak_project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  contract            TEXT,
  name                TEXT NOT NULL,
  federal_no          TEXT,
  county              TEXT,
  route               TEXT,
  structure           TEXT,
  location            TEXT,
  contractor          TEXT,
  rig                 TEXT,
  driller             TEXT,
  logged_by           TEXT,
  supervisor          TEXT,
  reviewed_by         TEXT,
  date_start          TEXT,
  date_end            TEXT,
  remarks             TEXT,
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

ALTER TABLE public.borelog_projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.borelog_borings (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES public.borelog_projects(id) ON DELETE CASCADE,
  boring_no    TEXT,
  header_data  JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.borelog_samples (
  id           TEXT PRIMARY KEY,
  boring_id    TEXT NOT NULL REFERENCES public.borelog_borings(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES public.borelog_projects(id) ON DELETE CASCADE,
  sample_no    INTEGER NOT NULL DEFAULT 0,
  lab_data     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_borelog_projects_contract
  ON public.borelog_projects (contract) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_borelog_projects_labtrak
  ON public.borelog_projects (labtrak_project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_borelog_projects_archived
  ON public.borelog_projects (archived_at) WHERE archived_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_borelog_borings_project
  ON public.borelog_borings (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_borelog_samples_boring
  ON public.borelog_samples (boring_id, sample_no) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_borelog_samples_project
  ON public.borelog_samples (project_id) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_borelog_projects_updated_at ON public.borelog_projects';
    EXECUTE 'CREATE TRIGGER trg_borelog_projects_updated_at BEFORE UPDATE ON public.borelog_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_borelog_borings_updated_at ON public.borelog_borings';
    EXECUTE 'CREATE TRIGGER trg_borelog_borings_updated_at BEFORE UPDATE ON public.borelog_borings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_borelog_samples_updated_at ON public.borelog_samples';
    EXECUTE 'CREATE TRIGGER trg_borelog_samples_updated_at BEFORE UPDATE ON public.borelog_samples FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

ALTER TABLE public.borelog_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borelog_borings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borelog_samples  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labtrak_borelog_projects_all" ON public.borelog_projects;
DROP POLICY IF EXISTS "labtrak_borelog_borings_all"  ON public.borelog_borings;
DROP POLICY IF EXISTS "labtrak_borelog_samples_all"  ON public.borelog_samples;

DROP POLICY IF EXISTS "borelog_projects authenticated read" ON public.borelog_projects;
DROP POLICY IF EXISTS "borelog_projects field lab write" ON public.borelog_projects;
DROP POLICY IF EXISTS "borelog_projects field lab update" ON public.borelog_projects;
DROP POLICY IF EXISTS "borelog_projects no hard delete" ON public.borelog_projects;
CREATE POLICY "borelog_projects authenticated read" ON public.borelog_projects
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL AND public.st_current_role() NOT IN ('pm', 'supplier'));
CREATE POLICY "borelog_projects field lab write" ON public.borelog_projects
  FOR INSERT TO authenticated
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'));
CREATE POLICY "borelog_projects field lab update" ON public.borelog_projects
  FOR UPDATE TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'));
CREATE POLICY "borelog_projects no hard delete" ON public.borelog_projects
  FOR DELETE TO authenticated USING (FALSE);

DROP POLICY IF EXISTS "borelog_borings authenticated read" ON public.borelog_borings;
DROP POLICY IF EXISTS "borelog_borings field lab write" ON public.borelog_borings;
DROP POLICY IF EXISTS "borelog_borings field lab update" ON public.borelog_borings;
DROP POLICY IF EXISTS "borelog_borings no hard delete" ON public.borelog_borings;
CREATE POLICY "borelog_borings authenticated read" ON public.borelog_borings
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL AND public.st_current_role() NOT IN ('pm', 'supplier'));
CREATE POLICY "borelog_borings field lab write" ON public.borelog_borings
  FOR INSERT TO authenticated
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'));
CREATE POLICY "borelog_borings field lab update" ON public.borelog_borings
  FOR UPDATE TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'));
CREATE POLICY "borelog_borings no hard delete" ON public.borelog_borings
  FOR DELETE TO authenticated USING (FALSE);

DROP POLICY IF EXISTS "borelog_samples authenticated read" ON public.borelog_samples;
DROP POLICY IF EXISTS "borelog_samples field lab write" ON public.borelog_samples;
DROP POLICY IF EXISTS "borelog_samples field lab update" ON public.borelog_samples;
DROP POLICY IF EXISTS "borelog_samples no hard delete" ON public.borelog_samples;
CREATE POLICY "borelog_samples authenticated read" ON public.borelog_samples
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL AND public.st_current_role() NOT IN ('pm', 'supplier'));
CREATE POLICY "borelog_samples field lab write" ON public.borelog_samples
  FOR INSERT TO authenticated
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'));
CREATE POLICY "borelog_samples field lab update" ON public.borelog_samples
  FOR UPDATE TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'));
CREATE POLICY "borelog_samples no hard delete" ON public.borelog_samples
  FOR DELETE TO authenticated USING (FALSE);

REVOKE ALL ON TABLE public.borelog_projects FROM anon;
REVOKE ALL ON TABLE public.borelog_borings FROM anon;
REVOKE ALL ON TABLE public.borelog_samples FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.borelog_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.borelog_borings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.borelog_samples TO authenticated;

NOTIFY pgrst, 'reload schema';
