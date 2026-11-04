-- Reduce per-row RLS authorization work when reading monthly activity logs.
-- Preserve the existing can_write_person visibility rules:
-- own records, all records for admins, and records in a head's authorized units;
-- also retain the legacy unit-null nursing-group fallback.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.readable_log_person_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p.id
  FROM public.people p
  LEFT JOIN public.staff_directory sd ON sd.source_row = p.staff_directory_id
  WHERE p.user_id = (SELECT auth.uid())
     OR (SELECT public.my_role()) = 'admin'
     OR (
       (SELECT public.my_role()) = 'head'
       AND (
         p.unit_id IN (SELECT public.my_units())
         OR (
           p.unit_id IS NULL
           AND EXISTS (
             SELECT 1
             FROM public.profiles me
             WHERE me.user_id = (SELECT auth.uid())
               AND (
                 me.nursing_group = sd.nursing_group
                 OR EXISTS (
                   SELECT 1
                   FROM public.units u
                   WHERE u.parent_group = sd.nursing_group
                     AND u.id IN (SELECT public.my_units())
                 )
               )
           )
         )
       )
     );
$function$;

REVOKE ALL ON FUNCTION private.readable_log_person_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.readable_log_person_ids() TO authenticated;

DROP POLICY IF EXISTS log_read ON public.logs;
CREATE POLICY log_read ON public.logs
FOR SELECT TO authenticated
USING (
  (SELECT public.my_role()) IN ('committee', 'admin')
  OR person_id IN (SELECT private.readable_log_person_ids())
);
