-- ConTrak access and each person's book. Run once.
-- contrak_role: none | user | admin
-- contrak_scope: own (their contracts) | all (every Materials & Research book)
CREATE TABLE IF NOT EXISTS public.contrak_access (
  user_id TEXT PRIMARY KEY,
  contrak_role TEXT NOT NULL DEFAULT 'none',
  contrak_scope TEXT NOT NULL DEFAULT 'own',
  view_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contrak_books (
  user_id TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contrak_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrak_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contrak_access_all" ON public.contrak_access;
CREATE POLICY "contrak_access_all" ON public.contrak_access
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "contrak_books_all" ON public.contrak_books;
CREATE POLICY "contrak_books_all" ON public.contrak_books
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
