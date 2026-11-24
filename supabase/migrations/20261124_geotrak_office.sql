-- Office Google Drive settings for GeoTrak. Run once.
-- One client id and one shared folder URL for the whole office.
-- A LabTrak login can read them only with a GeoTrak grant.
-- A GeoTrak admin (or a LabTrak admin who was not set to No GeoTrak) can save them.
-- There is no client secret column. Do not add one.

CREATE TABLE IF NOT EXISTS public.geotrak_office (
  id TEXT PRIMARY KEY DEFAULT 'office',
  client_id TEXT NOT NULL DEFAULT '',
  folder_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT geotrak_office_singleton CHECK (id = 'office')
);

ALTER TABLE public.geotrak_office ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.geotrak_office_grant()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.geotrak_access AS a
      WHERE a.user_id = public.st_app_user_id()
        AND a.geotrak_role = 'none'
    ) THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.geotrak_access AS a
      WHERE a.user_id = public.st_app_user_id()
        AND a.geotrak_role = 'admin'
    ) THEN 'admin'
    WHEN EXISTS (
      SELECT 1 FROM public.geotrak_access AS a
      WHERE a.user_id = public.st_app_user_id()
        AND a.geotrak_role = 'user'
    ) THEN 'user'
    WHEN public.st_current_role() = 'admin' THEN 'admin'
    ELSE NULL
  END
$$;

DROP POLICY IF EXISTS "geotrak_office read" ON public.geotrak_office;
DROP POLICY IF EXISTS "geotrak_office write" ON public.geotrak_office;
CREATE POLICY "geotrak_office read" ON public.geotrak_office
  FOR SELECT TO authenticated
  USING (public.geotrak_office_grant() IN ('user', 'admin'));
CREATE POLICY "geotrak_office write" ON public.geotrak_office
  FOR ALL TO authenticated
  USING (public.geotrak_office_grant() = 'admin')
  WITH CHECK (public.geotrak_office_grant() = 'admin');

REVOKE ALL ON TABLE public.geotrak_office FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.geotrak_office TO authenticated;
GRANT EXECUTE ON FUNCTION public.geotrak_office_grant() TO authenticated;

NOTIFY pgrst, 'reload schema';
