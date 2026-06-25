-- Core Drill module — one row per pavement core (Field Control)

CREATE TABLE IF NOT EXISTS public.core_drills (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_no          TEXT,
  contract         TEXT,
  road             TEXT,
  location         TEXT,
  station          TEXT,
  lane             TEXT,
  core_no          TEXT,
  gps_coordinates  TEXT,
  thickness_in     NUMERIC,
  depth_in         NUMERIC,
  layer_type       TEXT,
  remarks          TEXT,
  photo_data       JSONB,
  field_test_id    UUID REFERENCES public.field_tests(id) ON DELETE CASCADE,
  sampled_by       TEXT,
  date_drilled     TEXT,
  status           TEXT DEFAULT 'open',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_drills_test_no       ON public.core_drills (test_no);
CREATE INDEX IF NOT EXISTS idx_core_drills_contract      ON public.core_drills (contract);
CREATE INDEX IF NOT EXISTS idx_core_drills_field_test_id ON public.core_drills (field_test_id);
CREATE INDEX IF NOT EXISTS idx_core_drills_date_drilled  ON public.core_drills (date_drilled DESC);
CREATE INDEX IF NOT EXISTS idx_core_drills_created_at    ON public.core_drills (created_at DESC);

DROP TRIGGER IF EXISTS trg_core_drills_updated_at ON public.core_drills;
CREATE TRIGGER trg_core_drills_updated_at
  BEFORE UPDATE ON public.core_drills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.core_drills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labtrak_core_drills_all" ON public.core_drills;
CREATE POLICY "labtrak_core_drills_all" ON public.core_drills
  FOR ALL USING (true) WITH CHECK (true);

-- Production RLS (mirror field_tests — field roles)
DROP POLICY IF EXISTS "core_drills authenticated read" ON public.core_drills;
DROP POLICY IF EXISTS "core_drills field write"        ON public.core_drills;
DROP POLICY IF EXISTS "core_drills no hard delete"     ON public.core_drills;

CREATE POLICY "core_drills authenticated read" ON public.core_drills
  FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL);
CREATE POLICY "core_drills field write" ON public.core_drills
  FOR ALL TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'field'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field'));
CREATE POLICY "core_drills no hard delete" ON public.core_drills
  FOR DELETE TO authenticated USING (public.st_is_admin());
