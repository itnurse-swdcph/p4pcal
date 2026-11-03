-- Rebuild the monthly RPC from the complete v_logs pipeline, pushing the
-- requested month/unit/person filters below every window aggregate.
DO $migration$
DECLARE
  v_view text;
BEGIN
  v_view := rtrim(pg_get_viewdef('public.v_logs'::regclass, true), E'; \n\r\t');

  IF position('FROM v_logs_base b' in v_view) = 0 THEN
    RAISE EXCEPTION 'Expected v_logs_base source was not found in v_logs definition';
  END IF;

  v_view := replace(
    v_view,
    'FROM v_logs_base b',
    'FROM (SELECT * FROM public.v_logs_base
           WHERE work_date >= $1
             AND work_date <= $2
             AND ($3 IS NULL OR unit_id = $3)
             AND ($4 IS NULL OR person_id = ANY($4))) b'
  );

  IF position('WHERE work_date >= $1' in v_view) = 0 THEN
    RAISE EXCEPTION 'Monthly filters were not pushed into v_logs pipeline';
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.get_v_logs_month(
      p_start date,
      p_end date,
      p_unit_id bigint DEFAULT NULL,
      p_person_ids uuid[] DEFAULT NULL
    )
    RETURNS SETOF public.v_logs
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = public, extensions
    AS $function$ ' || v_view || ' $function$';

  REVOKE ALL ON FUNCTION public.get_v_logs_month(date,date,bigint,uuid[]) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.get_v_logs_month(date,date,bigint,uuid[]) TO authenticated;
END
$migration$;
