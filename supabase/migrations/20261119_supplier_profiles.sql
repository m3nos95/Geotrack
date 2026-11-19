-- One company profile per concrete supplier plant.
-- LabTrak has no plant id that groups two supplier logins. Each invite
-- gets its own app_user_id (sup_…), and mix designs are owned by that id.
-- The invite screen says one login per plant, so this row uses that same
-- id as plant_key. Every sign-in that already shares the plant's app user
-- id shares this profile. A supplier can write only that row. DelDOT roles
-- that can already read mix_designs can read every profile.
-- Safe to run once. Running it again keeps existing rows.

CREATE OR REPLACE FUNCTION public.st_current_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.st_user_profiles
  WHERE auth_user_id = auth.uid() AND active = TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.st_app_user_id()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT app_user_id FROM public.st_user_profiles
  WHERE auth_user_id = auth.uid() AND active = TRUE
  LIMIT 1
$$;

CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  plant_key        TEXT PRIMARY KEY,
  company_name     TEXT NOT NULL,
  address          TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT NOT NULL,
  contact_name     TEXT NOT NULL,
  logo_data        TEXT NOT NULL,
  years_in_service INTEGER,
  note             TEXT NOT NULL DEFAULT '',
  updated_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_profiles_plant_key_check CHECK (
    plant_key = btrim(plant_key)
    AND length(plant_key) BETWEEN 1 AND 80
  ),
  CONSTRAINT supplier_profiles_company_check CHECK (
    length(btrim(company_name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT supplier_profiles_address_check CHECK (
    length(btrim(address)) BETWEEN 1 AND 300
  ),
  CONSTRAINT supplier_profiles_phone_check CHECK (
    length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 7 AND 20
    AND length(phone) <= 40
  ),
  CONSTRAINT supplier_profiles_email_check CHECK (
    email = btrim(email)
    AND length(email) <= 200
    AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT supplier_profiles_contact_check CHECK (
    length(btrim(contact_name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT supplier_profiles_logo_check CHECK (
    logo_data ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$'
    AND length(logo_data) BETWEEN 32 AND 700000
  ),
  CONSTRAINT supplier_profiles_years_check CHECK (
    years_in_service IS NULL
    OR (years_in_service >= 0 AND years_in_service <= 200)
  ),
  CONSTRAINT supplier_profiles_note_check CHECK (length(note) <= 500)
);

ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.supplier_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.supplier_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.st_current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.st_app_user_id() TO authenticated;

DROP POLICY IF EXISTS "supplier_profiles_supplier_read" ON public.supplier_profiles;
CREATE POLICY "supplier_profiles_supplier_read" ON public.supplier_profiles
  FOR SELECT TO authenticated
  USING (
    public.st_current_role() = 'supplier'
    AND plant_key = public.st_app_user_id()
  );

DROP POLICY IF EXISTS "supplier_profiles_supplier_insert" ON public.supplier_profiles;
CREATE POLICY "supplier_profiles_supplier_insert" ON public.supplier_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.st_current_role() = 'supplier'
    AND plant_key = public.st_app_user_id()
  );

DROP POLICY IF EXISTS "supplier_profiles_supplier_update" ON public.supplier_profiles;
CREATE POLICY "supplier_profiles_supplier_update" ON public.supplier_profiles
  FOR UPDATE TO authenticated
  USING (
    public.st_current_role() = 'supplier'
    AND plant_key = public.st_app_user_id()
  )
  WITH CHECK (
    public.st_current_role() = 'supplier'
    AND plant_key = public.st_app_user_id()
  );

-- mix_designs_staff_all lets admin, section_admin, and concrete read every mix.
-- mix_designs_approved_read lets every other signed-in role except supplier
-- read approved mixes. Those same roles can read every company profile.
DROP POLICY IF EXISTS "supplier_profiles_mix_reader" ON public.supplier_profiles;
CREATE POLICY "supplier_profiles_mix_reader" ON public.supplier_profiles
  FOR SELECT TO authenticated
  USING (
    public.st_current_role() IS NOT NULL
    AND public.st_current_role() != 'supplier'
  );

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_supplier_profiles_updated_at ON public.supplier_profiles';
    EXECUTE 'CREATE TRIGGER trg_supplier_profiles_updated_at BEFORE UPDATE ON public.supplier_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
