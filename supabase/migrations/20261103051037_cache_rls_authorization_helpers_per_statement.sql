-- Improve RLS performance by evaluating stable authorization helpers once per statement.
-- Authorization predicates are unchanged: only row-independent helper calls are wrapped
-- in scalar/set subqueries so PostgreSQL can use initplans.
ALTER POLICY ppl_head ON public.people
USING (
  (SELECT public.my_role()) = 'admin'
  OR (
    (SELECT public.my_role()) = 'head'
    AND (
      unit_id IN (SELECT public.my_units())
      OR (
        unit_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.staff_directory sd
          JOIN public.profiles me ON me.user_id = (SELECT auth.uid())
          WHERE sd.source_row = people.staff_directory_id
            AND (
              me.nursing_group = sd.nursing_group
              OR EXISTS (
                SELECT 1 FROM public.units u
                WHERE u.parent_group = sd.nursing_group
                  AND u.id IN (SELECT public.my_units())
              )
            )
        )
      )
    )
  )
)
WITH CHECK (
  (SELECT public.my_role()) = 'admin'
  OR (
    (SELECT public.my_role()) = 'head'
    AND (
      unit_id IN (SELECT public.my_units())
      OR (
        unit_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.staff_directory sd
          JOIN public.profiles me ON me.user_id = (SELECT auth.uid())
          WHERE sd.source_row = people.staff_directory_id
            AND (
              me.nursing_group = sd.nursing_group
              OR EXISTS (
                SELECT 1 FROM public.units u
                WHERE u.parent_group = sd.nursing_group
                  AND u.id IN (SELECT public.my_units())
              )
            )
        )
      )
    )
  )
);

ALTER POLICY ppl_read ON public.people
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT public.my_role()) = ANY (ARRAY['committee','admin']::text[])
  OR (
    (SELECT public.my_role()) = 'head'
    AND (
      unit_id IN (SELECT public.my_units())
      OR (
        unit_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.staff_directory sd
          JOIN public.profiles me ON me.user_id = (SELECT auth.uid())
          WHERE sd.source_row = people.staff_directory_id
            AND (
              me.nursing_group = sd.nursing_group
              OR EXISTS (
                SELECT 1 FROM public.units u
                WHERE u.parent_group = sd.nursing_group
                  AND u.id IN (SELECT public.my_units())
              )
            )
        )
      )
    )
  )
);

ALTER POLICY prof_read ON public.profiles
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT public.my_role()) = ANY (ARRAY['committee','admin']::text[])
  OR (
    (SELECT public.my_role()) = 'head'
    AND unit_id IN (SELECT public.my_units())
  )
);

ALTER POLICY staff_directory_read_authorized ON public.staff_directory
USING (
  (SELECT public.my_role()) = 'admin'
  OR (
    (SELECT public.my_role()) = 'head'
    AND EXISTS (
      SELECT 1 FROM public.units u
      WHERE trim(u.name) = trim(staff_directory.unit_name)
        AND u.id IN (SELECT public.my_units())
    )
  )
);

ALTER POLICY p4p_monthly_leave_insert ON public.p4p_monthly_leave
WITH CHECK (
  (
    (SELECT public.my_role()) = 'admin'
    OR ((SELECT public.my_role()) = 'head' AND unit_id IN (SELECT public.my_units()))
  )
  AND EXISTS (
    SELECT 1 FROM public.staff_directory sd
    JOIN public.units u ON u.id = p4p_monthly_leave.unit_id
    WHERE sd.source_row = p4p_monthly_leave.staff_directory_id
      AND sd.active = true AND sd.unit_name = u.name
  )
);

ALTER POLICY p4p_monthly_leave_read ON public.p4p_monthly_leave
USING (
  (SELECT public.my_role()) = 'admin'
  OR (
    (SELECT public.my_role()) = 'head'
    AND unit_id IN (SELECT public.my_units())
    AND EXISTS (
      SELECT 1 FROM public.staff_directory sd
      JOIN public.units u ON u.id = p4p_monthly_leave.unit_id
      WHERE sd.source_row = p4p_monthly_leave.staff_directory_id
        AND sd.active = true AND sd.unit_name = u.name
    )
  )
);

ALTER POLICY p4p_monthly_leave_update ON public.p4p_monthly_leave
USING (
  (SELECT public.my_role()) = 'admin'
  OR (
    (SELECT public.my_role()) = 'head'
    AND unit_id IN (SELECT public.my_units())
    AND EXISTS (
      SELECT 1 FROM public.staff_directory sd
      JOIN public.units u ON u.id = p4p_monthly_leave.unit_id
      WHERE sd.source_row = p4p_monthly_leave.staff_directory_id
        AND sd.active = true AND sd.unit_name = u.name
    )
  )
)
WITH CHECK (
  (
    (SELECT public.my_role()) = 'admin'
    OR ((SELECT public.my_role()) = 'head' AND unit_id IN (SELECT public.my_units()))
  )
  AND EXISTS (
    SELECT 1 FROM public.staff_directory sd
    JOIN public.units u ON u.id = p4p_monthly_leave.unit_id
    WHERE sd.source_row = p4p_monthly_leave.staff_directory_id
      AND sd.active = true AND sd.unit_name = u.name
  )
);

ALTER POLICY us_read ON public.unit_settings
USING (
  (SELECT public.my_role()) = ANY (ARRAY['committee','admin']::text[])
  OR unit_id IN (SELECT public.my_units())
);
