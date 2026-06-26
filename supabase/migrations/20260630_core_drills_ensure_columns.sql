-- Ensure core_drills exists with all expected columns (idempotent)
-- Run this if you see "Could not find the 'status' column of 'core_drills'" or similar schema errors.
-- After running: Supabase Dashboard → Settings → API → Reload schema (or wait ~1 min).

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

ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS test_no          TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS contract         TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS road             TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS location         TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS station          TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS lane             TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS core_no          TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS gps_coordinates  TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS thickness_in     NUMERIC;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS depth_in         NUMERIC;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS layer_type       TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS remarks          TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS photo_data       JSONB;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS field_test_id    UUID;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS sampled_by       TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS date_drilled     TEXT;
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'open';
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.core_drills ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

-- FK if field_tests exists and constraint not yet present
DO $$
BEGIN
  IF to_regclass('public.field_tests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'core_drills_field_test_id_fkey'
     ) THEN
    ALTER TABLE public.core_drills
      ADD CONSTRAINT core_drills_field_test_id_fkey
      FOREIGN KEY (field_test_id) REFERENCES public.field_tests(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_core_drills_test_no       ON public.core_drills (test_no);
CREATE INDEX IF NOT EXISTS idx_core_drills_contract      ON public.core_drills (contract);
CREATE INDEX IF NOT EXISTS idx_core_drills_field_test_id   ON public.core_drills (field_test_id);
CREATE INDEX IF NOT EXISTS idx_core_drills_date_drilled    ON public.core_drills (date_drilled DESC);
CREATE INDEX IF NOT EXISTS idx_core_drills_created_at      ON public.core_drills (created_at DESC);

DROP TRIGGER IF EXISTS trg_core_drills_updated_at ON public.core_drills;
CREATE TRIGGER trg_core_drills_updated_at
  BEFORE UPDATE ON public.core_drills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.core_drills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labtrak_core_drills_all" ON public.core_drills;
CREATE POLICY "labtrak_core_drills_all" ON public.core_drills
  FOR ALL USING (true) WITH CHECK (true);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
