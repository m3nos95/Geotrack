-- Ensure field_tests has all columns the app expects (idempotent)
-- Run if you see: "Could not find the 'status' column of 'field_tests' in the schema cache"
-- After running, reload PostgREST: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS public.field_tests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_no          TEXT,
  test_category    TEXT,
  contract         TEXT,
  fa_project       TEXT,
  contractor       TEXT,
  road             TEXT,
  location         TEXT,
  material_type    TEXT,
  sampled_by       TEXT,
  date_sampled     TEXT,
  test_date        TEXT,
  field_workflow   TEXT,
  sample_id        UUID,
  nuclear_data     JSONB,
  density_data     JSONB,
  status           TEXT DEFAULT 'open',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS test_no          TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS test_category    TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS contract         TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS fa_project       TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS contractor       TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS road             TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS location         TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS material_type    TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS sampled_by       TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS date_sampled     TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS test_date        TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS field_workflow   TEXT;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS sample_id        UUID;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS nuclear_data     JSONB;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS density_data     JSONB;
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'open';
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_field_tests_test_no    ON public.field_tests (test_no);
CREATE INDEX IF NOT EXISTS idx_field_tests_contract   ON public.field_tests (contract);
CREATE INDEX IF NOT EXISTS idx_field_tests_category   ON public.field_tests (test_category);
CREATE INDEX IF NOT EXISTS idx_field_tests_created_at ON public.field_tests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_tests_sample_id  ON public.field_tests (sample_id);
CREATE INDEX IF NOT EXISTS idx_field_tests_status     ON public.field_tests (status);

DROP TRIGGER IF EXISTS trg_field_tests_updated_at ON public.field_tests;
CREATE TRIGGER trg_field_tests_updated_at
  BEFORE UPDATE ON public.field_tests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
