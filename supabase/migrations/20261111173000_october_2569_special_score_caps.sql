-- October 2569: temporary monthly score caps for selected nursing units/roles.
-- The cap is applied in v_logs (activity aggregation) and again in p4p_calc
-- (allocation input) so previously cut points are restored consistently.
do $patch$
declare
  view_src text;
  fn_src text;
  old_view text := $old_view$                CASE
                    WHEN o.month <> '2026-10-01'::date THEN NULL::numeric
                    WHEN COALESCE(sd.org_role, ''::text) ~~* '%หัวหน้ากลุ่มงาน%'::text THEN 970::numeric
                    WHEN COALESCE(sd.org_role, ''::text) ~~* '%หัวหน้างาน%'::text THEN 1090::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 1%'::text THEN 1210::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 2%'::text THEN 1210::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 3%'::text THEN 970::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 4%'::text THEN 610::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 5%'::text THEN 970::numeric
                    ELSE NULL::numeric
                END AS monthly_score_cap$old_view$;
  new_view text := $new_view$                CASE
                    WHEN o.month <> '2026-10-01'::date THEN NULL::numeric
                    WHEN sd.unit_name IN (
                      'งานการพยาบาลผู้ป่วยในอายุรกรรมชาย',
                      'งานการพยาบาลผู้ป่วยในพิเศษปาริฉัตร',
                      'งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย',
                      'งานการพยาบาลผู้ป่วยออร์โธปิดิกส์',
                      'งานการพยาบาลเคมีบำบัด'
                    )
                      AND COALESCE(sd.org_role, ''::text) !~~* '%หัวหน้า%'::text
                      AND COALESCE(sd.position, ''::text) ~~* '%พยาบาล%'::text
                      THEN 1600::numeric
                    WHEN sd.unit_name IN (
                      'งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย',
                      'งานการพยาบาลผู้ป่วยในหลอดเลือดสมอง'
                    )
                      AND sd.position = 'พนักงานช่วยเหลือคนไข้'
                      THEN 800::numeric
                    WHEN COALESCE(sd.org_role, ''::text) ~~* '%หัวหน้ากลุ่มงาน%'::text THEN 970::numeric
                    WHEN COALESCE(sd.org_role, ''::text) ~~* '%หัวหน้างาน%'::text THEN 1090::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 1%'::text THEN 1210::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 2%'::text THEN 1210::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 3%'::text THEN 970::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 4%'::text THEN 610::numeric
                    WHEN COALESCE(sd.staff_group, ''::text) ~~* 'กลุ่ม 5%'::text THEN 970::numeric
                    ELSE NULL::numeric
                END AS monthly_score_cap$new_view$;
  old_fn text := $old_fn$'cap', case
        when m = DATE '2026-10-01' then g.guarantee - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end) + 10
        else (g.guarantee * g.cap_mult) - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end)
      end$old_fn$;
  new_fn text := $new_fn$'cap', case
        when m = DATE '2026-10-01'
          and d.unit_name in (
            'งานการพยาบาลผู้ป่วยในอายุรกรรมชาย',
            'งานการพยาบาลผู้ป่วยในพิเศษปาริฉัตร',
            'งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย',
            'งานการพยาบาลผู้ป่วยออร์โธปิดิกส์',
            'งานการพยาบาลเคมีบำบัด'
          )
          and coalesce(d.org_role, '') not ilike '%หัวหน้า%'
          and coalesce(d.position, '') ilike '%พยาบาล%'
          then 1600
        when m = DATE '2026-10-01'
          and d.unit_name in (
            'งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย',
            'งานการพยาบาลผู้ป่วยในหลอดเลือดสมอง'
          )
          and d.position = 'พนักงานช่วยเหลือคนไข้'
          then 800
        when m = DATE '2026-10-01' then g.guarantee - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end) + 10
        else (g.guarantee * g.cap_mult) - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end)
      end$new_fn$;
begin
  view_src := pg_get_viewdef('public.v_logs'::regclass, true);
  if position(old_view in view_src) = 0 then
    raise exception 'Expected original monthly_score_cap expression not found in public.v_logs';
  end if;
  execute 'create or replace view public.v_logs as ' || replace(view_src, old_view, new_view);

  fn_src := pg_get_functiondef('public.p4p_calc(date)'::regprocedure);
  if position(old_fn in fn_src) = 0 then
    raise exception 'Expected original cap expression not found in public.p4p_calc(date)';
  end if;
  execute replace(fn_src, old_fn, new_fn);
end
$patch$;
