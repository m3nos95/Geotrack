-- GeoTrak access. Run once.
-- geotrak_role: none | user | admin
-- Statewide reference data is not stored here. It stays in the local
-- GeoTrak project folder (refs/ and db.json).
CREATE TABLE IF NOT EXISTS public.geotrak_access (
  user_id TEXT PRIMARY KEY,
  geotrak_role TEXT NOT NULL DEFAULT 'none',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.geotrak_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.geotrak_can_read_user(target TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.st_is_admin()
    OR (target IS NOT NULL AND target = public.st_app_user_id())
    OR EXISTS (
      SELECT 1 FROM public.geotrak_access AS a
      WHERE a.user_id = public.st_app_user_id()
        AND a.geotrak_role = 'admin'
    )
$$;

CREATE OR REPLACE FUNCTION public.geotrak_can_write_access()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.st_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.geotrak_access AS a
      WHERE a.user_id = public.st_app_user_id()
        AND a.geotrak_role = 'admin'
    )
$$;

DROP POLICY IF EXISTS "geotrak_access_all" ON public.geotrak_access;
DROP POLICY IF EXISTS "geotrak_access read" ON public.geotrak_access;
DROP POLICY IF EXISTS "geotrak_access write" ON public.geotrak_access;
CREATE POLICY "geotrak_access read" ON public.geotrak_access
  FOR SELECT TO authenticated USING (public.geotrak_can_read_user(user_id));
CREATE POLICY "geotrak_access write" ON public.geotrak_access
  FOR ALL TO authenticated
  USING (public.geotrak_can_write_access())
  WITH CHECK (public.geotrak_can_write_access());

REVOKE ALL ON TABLE public.geotrak_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.geotrak_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.geotrak_can_read_user(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geotrak_can_write_access() TO authenticated;

NOTIFY pgrst, 'reload schema';
