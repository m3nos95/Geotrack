-- Shared office data that used to live in each browser.
-- Run once in the Supabase SQL editor.
-- Letters, source libraries, material types, custom teams, and hub limits
-- load for every signed-in LabTrak user.

CREATE TABLE IF NOT EXISTS public.labtrak_shared (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.labtrak_shared ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labtrak_shared staff all" ON public.labtrak_shared;

CREATE POLICY "labtrak_shared staff all" ON public.labtrak_shared
  FOR ALL TO authenticated
  USING (
    public.st_current_role() IS NOT NULL
    AND public.st_current_role() NOT IN ('pm', 'supplier')
  )
  WITH CHECK (
    public.st_current_role() IS NOT NULL
    AND public.st_current_role() NOT IN ('pm', 'supplier')
  );

GRANT SELECT, INSERT, UPDATE ON public.labtrak_shared TO authenticated;
