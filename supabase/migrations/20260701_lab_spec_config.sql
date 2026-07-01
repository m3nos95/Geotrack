-- Shared lab specification config (aggregate types, soil borrow specs, sieve nests)
CREATE TABLE IF NOT EXISTS lab_spec_config (
  id text PRIMARY KEY DEFAULT 'default',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

ALTER TABLE lab_spec_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_spec_config_read" ON lab_spec_config;
CREATE POLICY "lab_spec_config_read" ON lab_spec_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "lab_spec_config_write" ON lab_spec_config;
CREATE POLICY "lab_spec_config_write" ON lab_spec_config
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO lab_spec_config (id, config)
VALUES ('default', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
