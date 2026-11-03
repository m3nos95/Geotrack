-- Roster fields on the R18 person. Run once.
ALTER TABLE public.r18_users
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS labtrak_user_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_equipment JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
