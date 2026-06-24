-- Safe to run before Auth users exist. Keeps dev-open policy until production RLS migration.
CREATE TABLE IF NOT EXISTS public.st_user_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id        UUID NOT NULL UNIQUE,
  app_user_id         TEXT,
  display_name        TEXT,
  role                TEXT NOT NULL DEFAULT 'field' CHECK (role IN (
    'admin', 'section_admin', 'field', 'lab', 'concrete', 'hotmix', 'precast', 'chemlab'
  )),
  can_approve_reports BOOLEAN NOT NULL DEFAULT FALSE,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_st_user_profiles_auth ON public.st_user_profiles (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_st_user_profiles_app ON public.st_user_profiles (app_user_id);

ALTER TABLE public.st_user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labtrak_profiles_all" ON public.st_user_profiles;
CREATE POLICY "labtrak_profiles_all" ON public.st_user_profiles FOR ALL USING (true) WITH CHECK (true);
