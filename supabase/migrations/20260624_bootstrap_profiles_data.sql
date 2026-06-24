-- LabTrak bootstrap: profiles for existing Auth users
-- Run in Supabase SQL Editor, then set APPLY_RLS or run production_rls.sql

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

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('4e22bb83-aacb-42bd-84d3-f888743a3514', 'default-admin', 'Administrator', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('12827294-7bc3-452f-8636-607e06759b4f', 'u_1779900887836', 'Mike Street', 'lab', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('08b00f58-affe-4a5e-bc5b-13cbb5bafd16', 'u_1779900859019', 'Aaron Wieczorek', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('cc7b1f7e-8348-4892-9006-93ccec3511a7', 'u_1779907652395', 'Robin Davis', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('459341df-1eb4-43fd-a1f3-19885bb5b91c', 'u_1779907690674', 'Gilbert Ankiambom', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('7bad2bfb-7766-4493-af1c-015cfa24129f', 'u_1779907930643', 'Jennifer Pinkerton', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('2888ab93-00c0-48d2-b482-3ad1353d91db', 'u_1779907937788', 'Jay Evans', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('90091ce9-077a-449d-8c37-1469db6804e8', 'u_1779907907836', 'Josh Smith', 'lab', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('75c5bee2-f26b-4cae-9182-70ec9c429470', 'u_1779907916924', 'Nick Loebe', 'lab', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('4a3953e4-15cb-4fbb-b773-f95ecc054927', 'u_1779908175515', 'James Kwasnieski', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('86009835-aadc-4c51-92b3-10676ebc99b8', 'u_1779908162196', 'Dale Klecan', 'concrete', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('c41a5375-e007-4e55-bbc3-d6441d1c9707', 'u_1779908128452', 'Brendan Cook', 'concrete', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('1b836983-04b3-4dbd-adcb-da910d9125c3', 'u_1779907975643', 'Damian Blakely', 'field', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('ff75d152-405b-42f6-a1d9-25cde3aaa12b', 'u_1779908004899', 'Dave Bunting', 'concrete', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('b93799b9-10d0-41fd-a7ef-54b1efd364c2', 'u_1779907965979', 'Danny Sheline', 'field', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('87131cb0-0e58-441a-a4ff-18f98f6300e0', 'u_1779908276484', 'Catherine Schwander', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('3754055a-1b3f-4d69-b2cf-c6e4fae35420', 'u_1779908242580', 'Steven Peretiatko', 'admin', true)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('61e20e29-c278-4c09-bd93-d103e0b67cab', 'u_1779908016355', 'Zachery Welch', 'concrete', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('24acca3a-216f-46f1-89ac-ac9b68a430e4', 'u_1779908106043', 'William Gilbert', 'concrete', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('96f2e4be-6b17-4220-bbda-d168ebc78073', 'u_1779908204604', 'Andrew Mills', 'field', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

INSERT INTO public.st_user_profiles (auth_user_id, app_user_id, display_name, role, can_approve_reports)
VALUES ('355681f9-1ca2-4ce4-9264-4d31048fa200', 'u_1779908190140', 'Pete Lorang', 'field', false)
ON CONFLICT (auth_user_id) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, can_approve_reports = EXCLUDED.can_approve_reports;

