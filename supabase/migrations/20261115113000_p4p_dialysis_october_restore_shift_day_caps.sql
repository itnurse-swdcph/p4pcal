-- Restore shift/day-capped points for non-head dialysis nurses in October 2026 only.
-- Monthly score cap remains 1,600 points. Other units, staff groups and months
-- continue to use the existing shift/day caps.
DO $migration$
DECLARE
  view_sql text;
  old_join text := 'LEFT JOIN staff_directory sd ON sd.source_row = p.staff_directory_id';
  new_join text := 'LEFT JOIN LATERAL (SELECT sd0.* FROM staff_directory sd0 WHERE sd0.source_row = p.staff_directory_id OR (p.staff_directory_id IS NULL AND sd0.active AND trim(sd0.prefix) || trim(sd0.first_name) || '' '' || trim(sd0.last_name) = p.name AND trim(sd0.unit_name) = (SELECT uu.name FROM units uu WHERE uu.id = p.unit_id)) ORDER BY (sd0.source_row = p.staff_directory_id) DESC NULLS LAST LIMIT 1) sd ON true';
  old_match text := 'dx.source_row = px.staff_directory_id';
  new_match text := 'dx.source_row = px.staff_directory_id OR (px.staff_directory_id IS NULL AND dx.active AND trim(dx.prefix) || trim(dx.first_name) || '' '' || trim(dx.last_name) = px.name AND trim(dx.unit_name) = (SELECT uu.name FROM units uu WHERE uu.id = px.unit_id))';
BEGIN
  view_sql := pg_get_viewdef('public.v_logs'::regclass, true);

  IF position(old_join IN view_sql) = 0 THEN
    RAISE EXCEPTION 'Expected staff_directory join was not found in public.v_logs';
  END IF;
  IF position(old_match IN view_sql) = 0 THEN
    RAISE EXCEPTION 'Expected staff-directory identity match was not found in public.v_logs';
  END IF;

  view_sql := replace(view_sql, old_join, new_join);
  view_sql := replace(view_sql, old_match, new_match);

  EXECUTE 'CREATE OR REPLACE VIEW public.v_logs AS ' || view_sql;
END
$migration$;
