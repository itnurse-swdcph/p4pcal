-- Use the hospital's Bangkok calendar date when validating future P4P activity dates.
-- Preserve the existing view definition and all scoring/cap rules; change only the date boundary.
do $$
declare
  view_sql text;
begin
  select pg_get_viewdef('public.v_logs_base'::regclass, true)
    into view_sql;

  if position('CURRENT_DATE' in view_sql) = 0 then
    raise exception 'Expected CURRENT_DATE condition was not found in public.v_logs_base';
  end if;

  view_sql := replace(
    view_sql,
    'CURRENT_DATE',
    '(now() AT TIME ZONE ''Asia/Bangkok'')::date'
  );

  execute 'create or replace view public.v_logs_base as ' || view_sql;
end
$$;
