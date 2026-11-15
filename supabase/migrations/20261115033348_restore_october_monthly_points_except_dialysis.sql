do $$
declare
  view_sql text;
  old_block text := $old$
                CASE
                    WHEN o.month <> '2026-10-01'::date THEN NULL::numeric
                    WHEN (sd.unit_name = ANY (ARRAY['งานการพยาบาลไตเทียม'::text])) AND COALESCE(sd.org_role, ''::text) !~~* '%หัวหน้า%'::text AND COALESCE(sd."position", ''::text) ~~* '%พยาบาล%'::text THEN 1600::numeric
                    WHEN COALESCE(sd.org_role, ''::text) ~~* '%หัวหน้ากลุ่มงาน%'::text THEN 1210::numeric
                    WHEN COALESCE(sd.org_role, ''::text) ~~* '%หัวหน้างาน%'::text THEN 1210::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 1%'::text THEN 1210::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 2%'::text THEN 1210::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 3%'::text THEN 730::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 4%'::text THEN 610::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 5%'::text THEN 610::numeric
                    ELSE NULL::numeric
                END AS monthly_score_cap
$old$;
  new_block text := $new$
                CASE
                    WHEN o.month = '2026-10-01'::date
                      AND sd.unit_name = 'งานการพยาบาลไตเทียม'
                      AND COALESCE(sd.org_role, ''::text) !~~* '%หัวหน้า%'::text
                      AND COALESCE(sd."position", ''::text) ~~* '%พยาบาล%'::text
                    THEN 1600::numeric
                    ELSE NULL::numeric
                END AS monthly_score_cap
$new$;
begin
  select pg_get_viewdef('public.v_logs'::regclass, true) into view_sql;
  if position(old_block in view_sql) = 0 then
    raise exception 'Expected October monthly score cap block not found; view was not changed';
  end if;
  view_sql := replace(view_sql, old_block, new_block);
  execute 'create or replace view public.v_logs as ' || view_sql;
end $$;