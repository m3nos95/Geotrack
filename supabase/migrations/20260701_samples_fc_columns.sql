-- Ensure samples has Field Control columns the app expects (idempotent)
-- Run if you see: "Could not find the 'field_test_id' column of 'samples' in the schema cache"
-- After running, reload PostgREST: NOTIFY pgrst, 'reload schema';

ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS record_kind   TEXT;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS field_test_id  UUID;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS nuclear_data   JSONB;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS density_data   JSONB;

CREATE INDEX IF NOT EXISTS idx_samples_record_kind ON public.samples (record_kind);
CREATE INDEX IF NOT EXISTS idx_samples_field_test  ON public.samples (field_test_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'samples_field_test_id_fkey'
  ) THEN
    ALTER TABLE public.samples
      ADD CONSTRAINT samples_field_test_id_fkey
      FOREIGN KEY (field_test_id) REFERENCES public.field_tests(id) ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
