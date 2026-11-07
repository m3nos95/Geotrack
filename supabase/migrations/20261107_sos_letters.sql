-- Save Source of Supply letters in LabTrak, linked to a project by contract number.
-- Run once in the Supabase SQL editor.
-- A project manager can read the letters for projects linked to their LabTrak id.

CREATE TABLE IF NOT EXISTS public.sos_letters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract     TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  contractor   TEXT NOT NULL DEFAULT '',
  district     TEXT NOT NULL DEFAULT '',
  contact      TEXT NOT NULL DEFAULT '',
  letter_date  DATE,
  doc_kind     TEXT NOT NULL DEFAULT '',
  revision     INTEGER,
  sources      JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc           JSONB NOT NULL DEFAULT '[]'::jsonb,
  letter_text  TEXT NOT NULL DEFAULT '',
  letter_html  TEXT NOT NULL DEFAULT '',
  saved_by     TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sos_letters_contract ON public.sos_letters (contract);
CREATE INDEX IF NOT EXISTS idx_sos_letters_created ON public.sos_letters (created_at DESC);

CREATE OR REPLACE FUNCTION public.st_current_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.st_user_profiles
  WHERE auth_user_id = auth.uid() AND active = TRUE
  LIMIT 1
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

ALTER TABLE public.sos_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sos_letters staff read" ON public.sos_letters;
DROP POLICY IF EXISTS "sos_letters staff insert" ON public.sos_letters;
DROP POLICY IF EXISTS "sos_letters pm read" ON public.sos_letters;

CREATE POLICY "sos_letters staff read" ON public.sos_letters
  FOR SELECT TO authenticated USING (
    public.st_current_role() IS NOT NULL
    AND public.st_current_role() NOT IN ('pm', 'supplier')
  );

CREATE POLICY "sos_letters staff insert" ON public.sos_letters
  FOR INSERT TO authenticated WITH CHECK (
    public.st_current_role() IS NOT NULL
    AND public.st_current_role() NOT IN ('pm', 'supplier')
  );

CREATE POLICY "sos_letters pm read" ON public.sos_letters
  FOR SELECT TO authenticated USING (
    public.st_current_role() = 'pm'
    AND contract IN (
      SELECT p.contract
      FROM public.projects p
      WHERE p.deleted_at IS NULL
        AND public.project_visible_to_current_pm(p.project_manager)
    )
  );

GRANT SELECT, INSERT ON public.sos_letters TO authenticated;
