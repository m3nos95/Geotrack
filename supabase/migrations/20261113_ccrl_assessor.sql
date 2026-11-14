-- AASHTO CCRL assessor portal.
-- Run once in the Supabase SQL editor.
-- Adds the ccrl role. An assessor can read R-18 and cannot insert, update, or delete those records.
-- The same module reads already closed to project managers and suppliers stay closed to assessors.

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
    'hotmix', 'precast', 'chemlab', 'supplier', 'pm', 'ccrl'
  ));

-- Keep a SELECT policy on every R-18 table, then rewrite write policies so ccrl cannot change a row.
DO $$
DECLARE
  tbl text;
  pol record;
  cmd text;
  using_sql text;
  check_sql text;
  extra text := 'public.st_current_role() IS DISTINCT FROM ''ccrl''';
BEGIN
  FOR tbl IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'r18\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "r18 ccrl read" ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY "r18 ccrl read" ON public.%I FOR SELECT TO authenticated USING (public.st_current_role() IS NOT NULL)',
      tbl
    );

    FOR pol IN
      SELECT p.polname,
             p.polcmd,
             pg_get_expr(p.polqual, p.polrelid) AS qual,
             pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = tbl
        AND p.polcmd <> 'r'
        AND p.polname <> 'r18 ccrl read'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.polname, tbl);
      using_sql := CASE
        WHEN pol.qual IS NULL THEN extra
        WHEN pol.qual ILIKE '%ccrl%' THEN pol.qual
        ELSE '(' || pol.qual || ') AND ' || extra
      END;
      check_sql := CASE
        WHEN pol.with_check IS NULL THEN extra
        WHEN pol.with_check ILIKE '%ccrl%' THEN pol.with_check
        ELSE '(' || pol.with_check || ') AND ' || extra
      END;

      IF pol.polcmd = '*' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
          pol.polname || ' insert', tbl, check_sql
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
          pol.polname || ' update', tbl, using_sql, check_sql
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
          pol.polname || ' delete', tbl, using_sql
        );
      ELSE
        cmd := CASE pol.polcmd
          WHEN 'a' THEN 'INSERT'
          WHEN 'w' THEN 'UPDATE'
          WHEN 'd' THEN 'DELETE'
          ELSE 'ALL'
        END;
        IF cmd = 'INSERT' THEN
          EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
            pol.polname, tbl, check_sql
          );
        ELSIF cmd = 'DELETE' THEN
          EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
            pol.polname, tbl, using_sql
          );
        ELSIF cmd = 'UPDATE' THEN
          EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
            pol.polname, tbl, using_sql, check_sql
          );
        ELSE
          EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
            pol.polname, tbl, using_sql, check_sql
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Module reads that already exclude project managers and suppliers also exclude assessors.
DO $$
DECLARE
  r record;
  newqual text;
  newcheck text;
  cmd text;
  stmt text;
  changed boolean;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') LIKE '%''pm''%'
        OR COALESCE(with_check, '') LIKE '%''pm''%'
      )
      AND (
        COALESCE(qual, '') LIKE '%''supplier''%'
        OR COALESCE(with_check, '') LIKE '%''supplier''%'
      )
  LOOP
    newqual := r.qual;
    newcheck := r.with_check;
    changed := false;
    IF newqual IS NOT NULL AND newqual NOT ILIKE '%ccrl%' THEN
      IF newqual LIKE '%''pm''::text, ''supplier''::text%' THEN
        newqual := replace(newqual, '''pm''::text, ''supplier''::text', '''pm''::text, ''supplier''::text, ''ccrl''::text');
        changed := true;
      ELSIF newqual LIKE '%''pm'', ''supplier''%' THEN
        newqual := replace(newqual, '''pm'', ''supplier''', '''pm'', ''supplier'', ''ccrl''');
        changed := true;
      END IF;
    END IF;
    IF newcheck IS NOT NULL AND newcheck NOT ILIKE '%ccrl%' THEN
      IF newcheck LIKE '%''pm''::text, ''supplier''::text%' THEN
        newcheck := replace(newcheck, '''pm''::text, ''supplier''::text', '''pm''::text, ''supplier''::text, ''ccrl''::text');
        changed := true;
      ELSIF newcheck LIKE '%''pm'', ''supplier''%' THEN
        newcheck := replace(newcheck, '''pm'', ''supplier''', '''pm'', ''supplier'', ''ccrl''');
        changed := true;
      END IF;
    END IF;
    IF NOT changed THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    cmd := lower(r.cmd);
    stmt := format(
      'CREATE POLICY %I ON %I.%I FOR %s TO authenticated',
      r.policyname, r.schemaname, r.tablename, cmd
    );
    IF newqual IS NOT NULL AND cmd IN ('select', 'update', 'delete', 'all') THEN
      stmt := stmt || ' USING (' || newqual || ')';
    END IF;
    IF newcheck IS NOT NULL AND cmd IN ('insert', 'update', 'all') THEN
      stmt := stmt || ' WITH CHECK (' || newcheck || ')';
    END IF;
    IF cmd = 'insert' AND newcheck IS NULL AND newqual IS NOT NULL THEN
      stmt := stmt || ' WITH CHECK (' || newqual || ')';
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
