-- DelDOT BoreLog cloud sync (LabTrak companion app)
-- Uses TEXT ids matching borelog localStorage uid() values.

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
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

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
CREATE INDEX IF NOT EXISTS idx_borelog_borings_project
  ON public.borelog_borings (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_borelog_samples_boring
  ON public.borelog_samples (boring_id, sample_no) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_borelog_samples_project
  ON public.borelog_samples (project_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_borelog_projects_updated_at ON public.borelog_projects;
CREATE TRIGGER trg_borelog_projects_updated_at
  BEFORE UPDATE ON public.borelog_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_borelog_borings_updated_at ON public.borelog_borings;
CREATE TRIGGER trg_borelog_borings_updated_at
  BEFORE UPDATE ON public.borelog_borings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_borelog_samples_updated_at ON public.borelog_samples;
CREATE TRIGGER trg_borelog_samples_updated_at
  BEFORE UPDATE ON public.borelog_samples
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Dev / open policies (match schema.sql defaults)
ALTER TABLE public.borelog_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borelog_borings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borelog_samples  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labtrak_borelog_projects_all" ON public.borelog_projects;
DROP POLICY IF EXISTS "labtrak_borelog_borings_all"  ON public.borelog_borings;
DROP POLICY IF EXISTS "labtrak_borelog_samples_all"  ON public.borelog_samples;

CREATE POLICY "labtrak_borelog_projects_all" ON public.borelog_projects
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_borelog_borings_all" ON public.borelog_borings
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_borelog_samples_all" ON public.borelog_samples
  FOR ALL USING (true) WITH CHECK (true);

-- Production RLS (field + lab roles, soft delete only)
DO $$
BEGIN
  IF to_regclass('public.st_user_profiles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "labtrak_borelog_projects_all" ON public.borelog_projects';
    EXECUTE 'DROP POLICY IF EXISTS "labtrak_borelog_borings_all" ON public.borelog_borings';
    EXECUTE 'DROP POLICY IF EXISTS "labtrak_borelog_samples_all" ON public.borelog_samples';

    EXECUTE 'DROP POLICY IF EXISTS "borelog_projects authenticated read" ON public.borelog_projects';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_projects field lab write" ON public.borelog_projects';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_projects no hard delete" ON public.borelog_projects';

    EXECUTE 'CREATE POLICY "borelog_projects authenticated read" ON public.borelog_projects FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "borelog_projects field lab write" ON public.borelog_projects FOR ALL TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_projects no hard delete" ON public.borelog_projects FOR DELETE TO authenticated USING (FALSE)';

    EXECUTE 'DROP POLICY IF EXISTS "borelog_borings authenticated read" ON public.borelog_borings';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_borings field lab write" ON public.borelog_borings';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_borings no hard delete" ON public.borelog_borings';

    EXECUTE 'CREATE POLICY "borelog_borings authenticated read" ON public.borelog_borings FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "borelog_borings field lab write" ON public.borelog_borings FOR ALL TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_borings no hard delete" ON public.borelog_borings FOR DELETE TO authenticated USING (FALSE)';

    EXECUTE 'DROP POLICY IF EXISTS "borelog_samples authenticated read" ON public.borelog_samples';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_samples field lab write" ON public.borelog_samples';
    EXECUTE 'DROP POLICY IF EXISTS "borelog_samples no hard delete" ON public.borelog_samples';

    EXECUTE 'CREATE POLICY "borelog_samples authenticated read" ON public.borelog_samples FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "borelog_samples field lab write" ON public.borelog_samples FOR ALL TO authenticated USING (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab'')) WITH CHECK (public.st_current_role() IN (''admin'', ''section_admin'', ''field'', ''lab''))';
    EXECUTE 'CREATE POLICY "borelog_samples no hard delete" ON public.borelog_samples FOR DELETE TO authenticated USING (FALSE)';
  END IF;
END $$;
