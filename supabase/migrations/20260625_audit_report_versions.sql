-- Audit log + report version history (from PR #1 production hardening)
-- Apply after 20260617_production_rls.sql so st_current_role() helpers exist.

CREATE TABLE IF NOT EXISTS public.st_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS st_audit_log_entity_idx
  ON public.st_audit_log(entity_type, entity_id, created_at DESC);

ALTER TABLE public.st_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow audit read" ON public.st_audit_log;
DROP POLICY IF EXISTS "Allow audit insert" ON public.st_audit_log;
DROP POLICY IF EXISTS "audit authenticated read" ON public.st_audit_log;
DROP POLICY IF EXISTS "audit authenticated insert" ON public.st_audit_log;
DROP POLICY IF EXISTS "audit no update" ON public.st_audit_log;
DROP POLICY IF EXISTS "audit no delete" ON public.st_audit_log;

CREATE POLICY "audit authenticated read" ON public.st_audit_log
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL);

CREATE POLICY "audit authenticated insert" ON public.st_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.st_current_role() IS NOT NULL);

CREATE POLICY "audit no update" ON public.st_audit_log
  FOR UPDATE TO authenticated USING (FALSE) WITH CHECK (FALSE);

CREATE POLICY "audit no delete" ON public.st_audit_log
  FOR DELETE TO authenticated USING (FALSE);

CREATE TABLE IF NOT EXISTS public.st_report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id TEXT NOT NULL,
  sample_test_no TEXT,
  report_type TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  status TEXT DEFAULT 'draft',
  sample_snapshot JSONB,
  lab_data JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  generated_by_id TEXT,
  generated_by_name TEXT,
  reviewed_by_id TEXT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS st_report_versions_sample_version_idx
  ON public.st_report_versions(sample_id, version_no);

CREATE INDEX IF NOT EXISTS st_report_versions_sample_idx
  ON public.st_report_versions(sample_id, created_at DESC);

ALTER TABLE public.st_report_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_versions authenticated read" ON public.st_report_versions;
DROP POLICY IF EXISTS "report_versions lab insert" ON public.st_report_versions;
DROP POLICY IF EXISTS "report_versions approver update" ON public.st_report_versions;
DROP POLICY IF EXISTS "report_versions no delete" ON public.st_report_versions;

CREATE POLICY "report_versions authenticated read" ON public.st_report_versions
  FOR SELECT TO authenticated
  USING (public.st_current_role() IS NOT NULL);

CREATE POLICY "report_versions lab insert" ON public.st_report_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'lab'));

CREATE POLICY "report_versions approver update" ON public.st_report_versions
  FOR UPDATE TO authenticated
  USING (
    public.st_current_role() IN ('admin', 'section_admin', 'lab')
    OR public.st_can_approve_reports()
  )
  WITH CHECK (
    public.st_current_role() IN ('admin', 'section_admin', 'lab')
    OR public.st_can_approve_reports()
  );

CREATE POLICY "report_versions no delete" ON public.st_report_versions
  FOR DELETE TO authenticated USING (FALSE);
