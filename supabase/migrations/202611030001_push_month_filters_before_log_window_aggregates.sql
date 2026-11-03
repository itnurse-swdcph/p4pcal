-- Push monthly/person/unit filters into the base log scan before window aggregates.
-- Filtering v_logs_base from outside is too late because its window functions
-- are evaluated over the full logs table first.
DO $migration$
DECLARE
  v_def text;
  v_view text;
  v_body text;
BEGIN
  v_def := pg_get_functiondef('public.get_v_logs_month(date,date,bigint,uuid[])'::regprocedure);
  v_view := rtrim(pg_get_viewdef('public.v_logs_base'::regclass, true), E'; \n\r\t');

  v_view := replace(v_view,
    'FROM logs l',
    'FROM (SELECT * FROM public.logs WHERE work_date >= $1 AND work_date <= $2 AND ($4 IS NULL OR person_id = ANY($4))) l');
  v_view := replace(v_view,
    'JOIN people p ON p.id = l.person_id',
    'JOIN people p ON p.id = l.person_id AND ($3 IS NULL OR p.unit_id = $3)');

  v_body := substring(v_def from '\\$function\\$(.*)\\$function\\$');
  IF v_body IS NULL THEN RAISE EXCEPTION 'Could not extract function body'; END IF;

  v_body := replace(v_body,
    'FROM (SELECT * FROM public.v_logs_base
           WHERE work_date >= $1
             AND work_date <= $2
             AND ($3 IS NULL OR unit_id = $3)
             AND ($4 IS NULL OR person_id = ANY($4))) b',
    'FROM (' || v_view || ') b');

  IF position('FROM public.logs WHERE work_date >= $1' in v_body) = 0 THEN
    RAISE EXCEPTION 'Filter pushdown replacement did not occur';
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.get_v_logs_month(p_start date, p_end date, p_unit_id bigint DEFAULT NULL, p_person_ids uuid[] DEFAULT NULL)
    RETURNS SETOF public.v_logs
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path = public, extensions
    AS $function$' || v_body || '$function$';

  REVOKE ALL ON FUNCTION public.get_v_logs_month(date,date,bigint,uuid[]) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.get_v_logs_month(date,date,bigint,uuid[]) TO authenticated;
END
$migration$;
