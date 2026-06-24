-- DelDOT LabTrak — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Projects ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract      TEXT UNIQUE,
  fa_project    TEXT,
  contractor    TEXT,
  road          TEXT,
  description   TEXT,
  material_type TEXT,
  examined_for  TEXT,
  reported_by   TEXT,
  reviewed_by   TEXT,
  qa_supervisor TEXT,
  geo_engineer  TEXT,
  status        TEXT DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ DEFAULT NULL
);

-- Add columns if projects table already existed from an older schema
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_contract ON projects (contract);
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects (status) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Samples ────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS sample_test_no_seq START 1000;

CREATE TABLE IF NOT EXISTS samples (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_no          TEXT DEFAULT 'T-' || nextval('sample_test_no_seq')::TEXT,
  contract         TEXT,
  fa_project       TEXT,
  contractor       TEXT,
  road             TEXT,
  location         TEXT,
  depth            TEXT,
  elevation        TEXT,
  source           TEXT,
  material_type    TEXT,
  gps_coordinates  TEXT,
  method_placed    TEXT,
  sample_type      TEXT,
  date_sampled     TEXT,
  sampled_by       TEXT,
  remarks          TEXT,
  status           TEXT DEFAULT 'pending',
  lab_data         JSONB,
  reported_by      TEXT,
  reviewed_by      TEXT,
  qa_supervisor    TEXT,
  ia_supervisor    TEXT,
  geo_engineer     TEXT,
  date_received    TEXT,
  date_tested      TEXT,
  date_reported    TEXT,
  conforms         TEXT DEFAULT 'yes',
  lab_remarks      TEXT,
  test_category    TEXT,
  supplied_by      TEXT,
  archived         BOOLEAN DEFAULT FALSE,
  dist_status      TEXT,
  dist_submitted_by TEXT,
  dist_approved_by  TEXT,
  dist_approved_at  TIMESTAMPTZ,
  dist_rejected_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE samples ADD COLUMN IF NOT EXISTS gps_coordinates TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS test_category TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS supplied_by TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS dist_status TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS dist_submitted_by TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS dist_approved_by TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS dist_approved_at TIMESTAMPTZ;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS dist_rejected_reason TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE samples ADD COLUMN IF NOT EXISTS record_kind TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS field_test_id UUID;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS nuclear_data JSONB;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS density_data JSONB;

CREATE INDEX IF NOT EXISTS idx_samples_record_kind ON samples (record_kind);
CREATE INDEX IF NOT EXISTS idx_samples_field_test  ON samples (field_test_id);

-- ── Field tests (density / nuclear — not lab queue) ─────────────
CREATE TABLE IF NOT EXISTS field_tests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_no          TEXT,
  test_category    TEXT,
  contract         TEXT,
  fa_project       TEXT,
  contractor       TEXT,
  road             TEXT,
  location         TEXT,
  material_type    TEXT,
  sampled_by       TEXT,
  date_sampled     TEXT,
  test_date        TEXT,
  field_workflow   TEXT,
  sample_id        UUID REFERENCES samples(id) ON DELETE SET NULL,
  nuclear_data     JSONB,
  density_data     JSONB,
  status           TEXT DEFAULT 'open',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_field_test_id_fkey;
ALTER TABLE samples
  ADD CONSTRAINT samples_field_test_id_fkey
  FOREIGN KEY (field_test_id) REFERENCES field_tests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_field_tests_test_no    ON field_tests (test_no);
CREATE INDEX IF NOT EXISTS idx_field_tests_contract   ON field_tests (contract);
CREATE INDEX IF NOT EXISTS idx_field_tests_category   ON field_tests (test_category);
CREATE INDEX IF NOT EXISTS idx_field_tests_created_at ON field_tests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_tests_sample_id  ON field_tests (sample_id);
CREATE INDEX IF NOT EXISTS idx_field_tests_status     ON field_tests (status);

DROP TRIGGER IF EXISTS trg_field_tests_updated_at ON field_tests;
CREATE TRIGGER trg_field_tests_updated_at
  BEFORE UPDATE ON field_tests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_samples_contract   ON samples (contract);
CREATE INDEX IF NOT EXISTS idx_samples_test_no    ON samples (test_no);
CREATE INDEX IF NOT EXISTS idx_samples_status     ON samples (status);
CREATE INDEX IF NOT EXISTS idx_samples_created_at ON samples (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_active     ON samples (created_at DESC)
  WHERE deleted_at IS NULL AND (archived IS NULL OR archived = FALSE);

DROP TRIGGER IF EXISTS trg_samples_updated_at ON samples;
CREATE TRIGGER trg_samples_updated_at
  BEFORE UPDATE ON samples
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Users (PIN stored as PBKDF2 hash in pin_hash — never plaintext) ──
CREATE TABLE IF NOT EXISTS st_users (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'field',
  pin_hash            TEXT,
  recovery            TEXT,
  initials            TEXT,
  color               TEXT,
  can_approve_reports BOOLEAN DEFAULT FALSE,
  restricted_hubs     JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE st_users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE st_users ADD COLUMN IF NOT EXISTS can_approve_reports BOOLEAN DEFAULT FALSE;
ALTER TABLE st_users ADD COLUMN IF NOT EXISTS restricted_hubs JSONB;
ALTER TABLE st_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Migrate legacy plaintext pin column → pin_hash (one-time, if pin column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'st_users' AND column_name = 'pin'
  ) THEN
    UPDATE st_users
    SET pin_hash = COALESCE(pin_hash, pin)
    WHERE pin IS NOT NULL AND pin <> '' AND (pin_hash IS NULL OR pin_hash = '');
    ALTER TABLE st_users DROP COLUMN IF EXISTS pin;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_st_users_role ON st_users (role);

-- ── Auth profile bridge (Supabase Auth → LabTrak role) ─────────
-- Dev: open policy below. Production: run 20260617_production_rls.sql
CREATE TABLE IF NOT EXISTS st_user_profiles (
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

CREATE INDEX IF NOT EXISTS idx_st_user_profiles_auth ON st_user_profiles (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_st_user_profiles_app ON st_user_profiles (app_user_id);

DROP TRIGGER IF EXISTS trg_st_user_profiles_updated_at ON st_user_profiles;
CREATE TRIGGER trg_st_user_profiles_updated_at
  BEFORE UPDATE ON st_user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_st_users_updated_at ON st_users;
CREATE TRIGGER trg_st_users_updated_at
  BEFORE UPDATE ON st_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Approved sources ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approved_sources (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stockpile_location TEXT NOT NULL,
  material_type      TEXT,
  sample_date        TEXT,
  expire_date        TEXT,
  status             TEXT DEFAULT 'approved',
  sample_no          TEXT,
  notes              TEXT,
  updated_by         TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approved_sources_location ON approved_sources (stockpile_location);
CREATE INDEX IF NOT EXISTS idx_approved_sources_material ON approved_sources (material_type);

DROP TRIGGER IF EXISTS trg_approved_sources_updated_at ON approved_sources;
CREATE TRIGGER trg_approved_sources_updated_at
  BEFORE UPDATE ON approved_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Calendar notes (dashboard) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS st_cal_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  author_name TEXT,
  date        TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_st_cal_notes_user_date ON st_cal_notes (user_id, date);

-- ── Hub notes (field / lab / concrete hubs) ──────────────────────
CREATE TABLE IF NOT EXISTS st_hub_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub         TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  author_name TEXT,
  date        TEXT NOT NULL,
  text        TEXT NOT NULL,
  scope       TEXT DEFAULT 'mine',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_st_hub_notes_hub_user ON st_hub_notes (hub, user_id, date);

-- ── Concrete sets (optional cloud sync; app also uses localStorage) ──
CREATE TABLE IF NOT EXISTS concrete_sets (
  id            TEXT PRIMARY KEY,
  contract      TEXT,
  pour_location TEXT,
  data          JSONB NOT NULL DEFAULT '{}',
  archived      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concrete_sets_contract ON concrete_sets (contract);

DROP TRIGGER IF EXISTS trg_concrete_sets_updated_at ON concrete_sets;
CREATE TRIGGER trg_concrete_sets_updated_at
  BEFORE UPDATE ON concrete_sets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Audit log (sample status / approval changes) ───────────────
CREATE TABLE IF NOT EXISTS sample_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id   UUID REFERENCES samples(id) ON DELETE SET NULL,
  test_no     TEXT,
  action      TEXT NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sample_history_sample ON sample_history (sample_id, created_at DESC);

-- ── Row Level Security ─────────────────────────────────────────
-- Dev / prototype: open policies below (anon key + client PINs).
-- Production: run supabase/migrations/20260617_production_rls.sql AFTER Supabase Auth.
-- See supabase/docs/production-rls-rollout.md

ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples          ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_cal_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_hub_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE concrete_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_tests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_history   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labtrak_projects_all"         ON projects;
DROP POLICY IF EXISTS "labtrak_samples_all"          ON samples;
DROP POLICY IF EXISTS "labtrak_profiles_all"         ON st_user_profiles;
DROP POLICY IF EXISTS "labtrak_st_users_all"         ON st_users;
DROP POLICY IF EXISTS "labtrak_approved_sources_all" ON approved_sources;
DROP POLICY IF EXISTS "labtrak_st_cal_notes_all"     ON st_cal_notes;
DROP POLICY IF EXISTS "labtrak_st_hub_notes_all"     ON st_hub_notes;
DROP POLICY IF EXISTS "labtrak_concrete_sets_all"    ON concrete_sets;
DROP POLICY IF EXISTS "labtrak_field_tests_all"      ON field_tests;
DROP POLICY IF EXISTS "labtrak_sample_history_all"   ON sample_history;

-- Drop legacy policy names from embedded HTML comment
DROP POLICY IF EXISTS "Allow all projects" ON projects;
DROP POLICY IF EXISTS "Allow all"          ON samples;

CREATE POLICY "labtrak_projects_all"         ON projects         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_samples_all"          ON samples          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_profiles_all"           ON st_user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_st_users_all"         ON st_users         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_approved_sources_all" ON approved_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_st_cal_notes_all"     ON st_cal_notes     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_st_hub_notes_all"     ON st_hub_notes     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_concrete_sets_all"    ON concrete_sets    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_field_tests_all"      ON field_tests      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "labtrak_sample_history_all"   ON sample_history   FOR ALL USING (true) WITH CHECK (true);
