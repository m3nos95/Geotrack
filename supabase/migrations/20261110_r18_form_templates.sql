-- Custom procedure forms for R-18.
-- Run once in the Supabase SQL editor. Existing labs keep working before this runs;
-- Inventory → Procedure Forms explains that until the tables are present.

CREATE TABLE IF NOT EXISTS public.r18_form_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       UUID NOT NULL REFERENCES public.r18_labs(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  definition   JSONB NOT NULL DEFAULT '{}'::jsonb,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS r18_form_templates_lab_idx
  ON public.r18_form_templates (lab_id);

ALTER TABLE public.r18_procedures
  ADD COLUMN IF NOT EXISTS form_template_id UUID REFERENCES public.r18_form_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS r18_procedures_form_template_idx
  ON public.r18_procedures (form_template_id);

ALTER TABLE public.r18_form_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "r18_form_templates authenticated read"  ON public.r18_form_templates;
DROP POLICY IF EXISTS "r18_form_templates authenticated write" ON public.r18_form_templates;

CREATE POLICY "r18_form_templates authenticated read" ON public.r18_form_templates
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL);

CREATE POLICY "r18_form_templates authenticated write" ON public.r18_form_templates
  FOR ALL TO authenticated
  USING (public.st_current_role() IS NOT NULL)
  WITH CHECK (public.st_current_role() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.r18_form_templates TO authenticated;
