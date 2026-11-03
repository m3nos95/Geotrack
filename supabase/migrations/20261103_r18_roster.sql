-- Section, title, and hire date on the R18 person. Run once.
ALTER TABLE public.r18_users
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS hire_date DATE;

NOTIFY pgrst, 'reload schema';
