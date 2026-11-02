-- Shared mix design table. One row per design.
-- Safe to run once in the Supabase SQL editor. Running it again keeps existing rows.
-- Plants can read and edit only their own designs, and they cannot approve them.
-- Concrete staff can read every design and approve it.
-- Approved designs stay available for a pour. The pour still keeps its own copy.

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

CREATE TABLE IF NOT EXISTS public.mix_designs (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  supplier        TEXT NOT NULL DEFAULT '',
  concrete_class  TEXT NOT NULL DEFAULT '',
  required_fc     NUMERIC,
  cement_sks      TEXT NOT NULL DEFAULT '',
  plant           TEXT NOT NULL DEFAULT '',
  corr_factor     TEXT NOT NULL DEFAULT '',
  materials       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  review_note     TEXT NOT NULL DEFAULT '',
  submitted_by    TEXT NOT NULL DEFAULT '',
  owner_id        TEXT NOT NULL DEFAULT '',
  reviewed_by     TEXT NOT NULL DEFAULT '',
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mix_designs DROP CONSTRAINT IF EXISTS mix_designs_status_check;
ALTER TABLE public.mix_designs
  ADD CONSTRAINT mix_designs_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_mix_designs_owner ON public.mix_designs (owner_id);
CREATE INDEX IF NOT EXISTS idx_mix_designs_status ON public.mix_designs (status);

ALTER TABLE public.mix_designs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mix_designs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mix_designs TO authenticated;
GRANT EXECUTE ON FUNCTION public.st_current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.st_app_user_id() TO authenticated;

DROP POLICY IF EXISTS "mix_designs_staff_all" ON public.mix_designs;
CREATE POLICY "mix_designs_staff_all" ON public.mix_designs
  FOR ALL TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'concrete'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'concrete'));

DROP POLICY IF EXISTS "mix_designs_approved_read" ON public.mix_designs;
CREATE POLICY "mix_designs_approved_read" ON public.mix_designs
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    AND public.st_current_role() IS NOT NULL
    AND public.st_current_role() != 'supplier'
  );

DROP POLICY IF EXISTS "mix_designs_supplier_read" ON public.mix_designs;
CREATE POLICY "mix_designs_supplier_read" ON public.mix_designs
  FOR SELECT TO authenticated
  USING (
    public.st_current_role() = 'supplier'
    AND owner_id = public.st_app_user_id()
  );

DROP POLICY IF EXISTS "mix_designs_supplier_insert" ON public.mix_designs;
CREATE POLICY "mix_designs_supplier_insert" ON public.mix_designs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.st_current_role() = 'supplier'
    AND status = 'pending'
    AND owner_id = public.st_app_user_id()
  );

DROP POLICY IF EXISTS "mix_designs_supplier_update" ON public.mix_designs;
CREATE POLICY "mix_designs_supplier_update" ON public.mix_designs
  FOR UPDATE TO authenticated
  USING (
    public.st_current_role() = 'supplier'
    AND status != 'approved'
    AND owner_id = public.st_app_user_id()
  )
  WITH CHECK (
    public.st_current_role() = 'supplier'
    AND status != 'approved'
    AND owner_id = public.st_app_user_id()
  );

DROP POLICY IF EXISTS "mix_designs_supplier_delete" ON public.mix_designs;
CREATE POLICY "mix_designs_supplier_delete" ON public.mix_designs
  FOR DELETE TO authenticated
  USING (
    public.st_current_role() = 'supplier'
    AND status != 'approved'
    AND owner_id = public.st_app_user_id()
  );

-- Copy designs already saved in the old shared config row.
DO $$
BEGIN
  IF to_regclass('public.lab_spec_config') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.mix_designs (
    id, name, supplier, concrete_class, required_fc, cement_sks, plant, corr_factor,
    materials, status, review_note, submitted_by, owner_id, reviewed_by, reviewed_at,
    created_at, updated_at
  )
  SELECT
    d->>'id',
    COALESCE(NULLIF(d->>'name', ''), 'Untitled'),
    COALESCE(d->>'supplier', ''),
    COALESCE(d->>'concreteClass', ''),
    CASE
      WHEN COALESCE(d->>'requiredFc', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (d->>'requiredFc')::numeric
      ELSE NULL
    END,
    COALESCE(d->>'cementSks', ''),
    COALESCE(d->>'plant', ''),
    COALESCE(d->>'corrFactor', ''),
    COALESCE(d->'materials', '{}'::jsonb),
    CASE
      WHEN d->>'status' IN ('approved', 'rejected') THEN d->>'status'
      ELSE 'pending'
    END,
    COALESCE(d->>'reviewNote', ''),
    COALESCE(d->>'submittedBy', ''),
    COALESCE(d->>'ownerId', ''),
    COALESCE(d->>'reviewedBy', ''),
    CASE
      WHEN COALESCE(d->>'reviewedAt', '') ~ '^[0-9]{4}-' THEN (d->>'reviewedAt')::timestamptz
      ELSE NULL
    END,
    COALESCE(
      CASE WHEN COALESCE(d->>'createdAt', '') ~ '^[0-9]{4}-' THEN (d->>'createdAt')::timestamptz END,
      NOW()
    ),
    COALESCE(
      CASE WHEN COALESCE(d->>'updatedAt', '') ~ '^[0-9]{4}-' THEN (d->>'updatedAt')::timestamptz END,
      NOW()
    )
  FROM public.lab_spec_config AS cfg,
    jsonb_array_elements(COALESCE(cfg.config->'designs', '[]'::jsonb)) AS d
  WHERE cfg.id = 'mix_designs'
    AND COALESCE(d->>'id', '') != ''
    AND COALESCE(d->>'name', '') != ''
  ON CONFLICT (id) DO NOTHING;
END $$;
