-- Concrete sets must save for the people who actually pour and break them.
-- The June policy only let admin / section_admin / concrete write, so a lab
-- sign-in kept the set in that browser and the phone never saw it.
-- Read stays open to every signed-in LabTrak role.

DROP POLICY IF EXISTS "concrete_sets concrete write" ON public.concrete_sets;
CREATE POLICY "concrete_sets concrete write" ON public.concrete_sets
  FOR ALL TO authenticated
  USING (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab', 'concrete'))
  WITH CHECK (public.st_current_role() IN ('admin', 'section_admin', 'field', 'lab', 'concrete'));
