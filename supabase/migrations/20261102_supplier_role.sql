-- Allow the concrete supplier role on st_user_profiles.
-- Safe to run once in the Supabase SQL editor. Existing profile rows are unchanged.
-- CREATE TABLE IF NOT EXISTS does not update a check constraint that is already in place.

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'st_user_profiles'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.st_user_profiles DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE public.st_user_profiles
  ADD CONSTRAINT st_user_profiles_role_check
  CHECK (role IN (
    'admin', 'section_admin', 'field', 'lab', 'concrete',
    'hotmix', 'precast', 'chemlab', 'supplier'
  ));
