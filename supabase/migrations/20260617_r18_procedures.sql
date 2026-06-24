-- R-18 equipment procedures + completion history (Phase 1)
-- Run in Supabase SQL Editor after existing r18_* tables are present.

CREATE TABLE IF NOT EXISTS public.r18_procedures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id              UUID NOT NULL REFERENCES public.r18_labs(id) ON DELETE CASCADE,
  equipment_id        UUID NOT NULL REFERENCES public.r18_equipment(id) ON DELETE CASCADE,
  procedure_type      TEXT NOT NULL CHECK (procedure_type IN (
    'calibration', 'check', 'standardization', 'maintenance'
  )),
  name                TEXT NOT NULL,
  frequency_value     INTEGER NOT NULL DEFAULT 1 CHECK (frequency_value > 0),
  frequency_unit      TEXT NOT NULL DEFAULT 'months' CHECK (frequency_unit IN (
    'days', 'weeks', 'months', 'years'
  )),
  last_completed_at   TIMESTAMPTZ,
  next_due_at         TIMESTAMPTZ,
  instructions        TEXT,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS r18_procedures_lab_idx
  ON public.r18_procedures (lab_id);
CREATE INDEX IF NOT EXISTS r18_procedures_equipment_idx
  ON public.r18_procedures (equipment_id);
CREATE INDEX IF NOT EXISTS r18_procedures_next_due_idx
  ON public.r18_procedures (next_due_at) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS public.r18_procedure_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id              UUID NOT NULL REFERENCES public.r18_labs(id) ON DELETE CASCADE,
  equipment_id        UUID NOT NULL REFERENCES public.r18_equipment(id) ON DELETE CASCADE,
  procedure_id        UUID NOT NULL REFERENCES public.r18_procedures(id) ON DELETE CASCADE,
  completed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by        TEXT,
  result              TEXT CHECK (result IN ('pass', 'fail', 'acceptable', 'na')),
  notes               TEXT,
  certificate_number  TEXT,
  form_data           JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_due_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS r18_procedure_records_lab_idx
  ON public.r18_procedure_records (lab_id);
CREATE INDEX IF NOT EXISTS r18_procedure_records_procedure_idx
  ON public.r18_procedure_records (procedure_id);
CREATE INDEX IF NOT EXISTS r18_procedure_records_completed_idx
  ON public.r18_procedure_records (completed_at DESC);

-- RLS: authenticated LabTrak users (same pattern as other module tables)
ALTER TABLE public.r18_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r18_procedure_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "r18_procedures authenticated read"  ON public.r18_procedures;
DROP POLICY IF EXISTS "r18_procedures authenticated write" ON public.r18_procedures;
DROP POLICY IF EXISTS "r18_procedure_records authenticated read"  ON public.r18_procedure_records;
DROP POLICY IF EXISTS "r18_procedure_records authenticated write" ON public.r18_procedure_records;

CREATE POLICY "r18_procedures authenticated read" ON public.r18_procedures
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL);

CREATE POLICY "r18_procedures authenticated write" ON public.r18_procedures
  FOR ALL TO authenticated
  USING (public.st_current_role() IS NOT NULL)
  WITH CHECK (public.st_current_role() IS NOT NULL);

CREATE POLICY "r18_procedure_records authenticated read" ON public.r18_procedure_records
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL);

CREATE POLICY "r18_procedure_records authenticated write" ON public.r18_procedure_records
  FOR ALL TO authenticated
  USING (public.st_current_role() IS NOT NULL)
  WITH CHECK (public.st_current_role() IS NOT NULL);
