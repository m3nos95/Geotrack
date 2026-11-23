-- Completed LabTrak bore logs that GeoTrak plots.
-- One small row per boring. Statewide reference data stays in the
-- local GeoTrak project folder (refs/ and db.json).
CREATE TABLE IF NOT EXISTS public.geotrak_lab_borings (
  id              TEXT PRIMARY KEY,
  boring_no       TEXT NOT NULL DEFAULT '',
  project_name    TEXT NOT NULL DEFAULT '',
  contract        TEXT NOT NULL DEFAULT '',
  location        TEXT NOT NULL DEFAULT '',
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  surface_elev    TEXT NOT NULL DEFAULT '',
  date_completed  TEXT NOT NULL DEFAULT '',
  eob             DOUBLE PRECISION,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.geotrak_lab_borings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geotrak_lab_borings read" ON public.geotrak_lab_borings;
DROP POLICY IF EXISTS "geotrak_lab_borings write" ON public.geotrak_lab_borings;
CREATE POLICY "geotrak_lab_borings read" ON public.geotrak_lab_borings
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL AND public.st_current_role() NOT IN ('pm', 'supplier'));
CREATE POLICY "geotrak_lab_borings write" ON public.geotrak_lab_borings
  FOR ALL TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab'));

REVOKE ALL ON TABLE public.geotrak_lab_borings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.geotrak_lab_borings TO authenticated;

NOTIFY pgrst, 'reload schema';
