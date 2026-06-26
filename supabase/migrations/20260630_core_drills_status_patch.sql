-- Patch: add status column if core_drills was created without it
ALTER TABLE public.core_drills
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
