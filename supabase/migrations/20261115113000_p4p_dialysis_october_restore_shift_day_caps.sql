-- Restore shift/day-capped points for nurses in the dialysis nursing unit in October 2026 only.
-- Non-head dialysis nurses retain the special monthly cap of 1,600 points.
-- Head nurses retain their normal monthly cap; other units and months are unchanged.
DO $migration$
DECLARE
  view_sql text;
  old_join text := 'LEFT JOIN staff_directory sd ON sd.source_row = p.staff_directory_id';
  new_join text := 'LEFT JOIN LATERAL (SELECT sd0.* FROM staff_directory sd0 WHERE sd0.source_row = p.staff_directory_id OR (p.staff_directory_id IS NULL AND sd0.active AND trim(sd0.prefix) || trim(sd0.first_name) || '' '' || trim(sd0.last_name) = p.name AND trim(sd0.unit_name) = (SELECT uu.name FROM units uu WHERE uu.id = p.unit_id)) ORDER BY (sd0.source_row = p.staff_directory_id) DESC NULLS LAST LIMIT 1) sd ON true';
  old_match text := 'dx.source_row = px.staff_directory_id';
  new_match text := 'dx.source_row = px.staff_directory_id OR (px.staff_directory_id IS NULL AND dx.active AND trim(dx.prefix) || trim(dx.first_name) || '' '' || trim(dx.last_name) = px.name AND trim(dx.unit_name) = (SELECT uu.name FROM units uu WHERE uu.id = px.unit_id))';
  old_head_filter text := $old$AND COALESCE(dx.org_role, ''::text) !~~* '%หัวหน้า%'::text$old$;
  old_final text := $old$ELSE counted_points
        END AS counted_points,$old$;
  new_final text := $new$ELSE CASE WHEN month = '2026-10-01'::date AND (EXISTS ( SELECT 1 FROM people px JOIN staff_directory dx ON dx.source_row = px.staff_directory_id OR px.staff_directory_id IS NULL AND dx.active AND (((TRIM(BOTH FROM dx.prefix) || TRIM(BOTH FROM dx.first_name)) || ' '::text) || TRIM(BOTH FROM dx.last_name)) = px.name AND TRIM(BOTH FROM dx.unit_name) = (SELECT uu.name FROM units uu WHERE uu.id = px.unit_id) WHERE px.id = c.person_id AND dx.unit_name = 'งานการพยาบาลไตเทียม'::text AND COALESCE(dx."position", ''::text) ~~* '%พยาบาล%'::text)) THEN pts_eff ELSE counted_points END
        END AS counted_points,$new$;
BEGIN
  view_sql := pg_get_viewdef('public.v_logs'::regclass, true);

  -- Each replacement is conditional so the migration is safe if the live
  -- view was already updated directly before migration history is reconciled.
  IF position(old_join IN view_sql) > 0 THEN
    view_sql := replace(view_sql, old_join, new_join);
  END IF;
  IF position(old_match IN view_sql) > 0 THEN
    view_sql := replace(view_sql, old_match, new_match);
  END IF;
  IF position(old_head_filter IN view_sql) > 0 THEN
    view_sql := replace(view_sql, old_head_filter, '');
  END IF;
  IF position(old_final IN view_sql) > 0 THEN
    view_sql := replace(view_sql, old_final, new_final);
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_logs AS ' || view_sql;
END
$migration$;
