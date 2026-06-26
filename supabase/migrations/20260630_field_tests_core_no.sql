-- Store the user-facing core number on core drill sessions (distinct from internal test_no)
ALTER TABLE public.field_tests ADD COLUMN IF NOT EXISTS core_no TEXT;

CREATE INDEX IF NOT EXISTS idx_field_tests_core_no ON public.field_tests (core_no);

NOTIFY pgrst, 'reload schema';
