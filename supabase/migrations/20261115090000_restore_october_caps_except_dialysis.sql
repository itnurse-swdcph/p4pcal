-- Restore October 2569 monthly score caps to the standard ceilings.
-- Keep the 1,600-point exception only for non-head nurses in Dialysis Nursing.
-- Heads use a 1,210-point total ceiling (including guarantee).

DO $$
DECLARE
  v text;
  old_units text := 'ARRAY[''งานการพยาบาลผู้ป่วยในอายุรกรรมชาย''::text, ''งานการพยาบาลผู้ป่วยในพิเศษปาริฉัตร''::text, ''งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย''::text, ''งานการพยาบาลผู้ป่วยออร์โธปิดิกส์''::text, ''งานการพยาบาลเคมีบำบัด''::text, ''งานการพยาบาลไตเทียม''::text]';
  old_800 text := 'WHEN (sd.unit_name = ANY (ARRAY[''งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย''::text, ''งานการพยาบาลผู้ป่วยในหลอดเลือดสมอง''::text])) AND sd."position" = ''พนักงานช่วยเหลือคนไข้''::text THEN 800::numeric
                    ';
  old_head_group text := 'WHEN COALESCE(sd.org_role, ''''::text) ~~* ''%หัวหน้ากลุ่มงาน%''::text THEN 970::numeric';
  old_head_unit text := 'WHEN COALESCE(sd.org_role, ''''::text) ~~* ''%หัวหน้างาน%''::text THEN 1090::numeric';
  old_group3 text := 'WHEN COALESCE(sd.staff_group, ''''::text) ~~* ''กลุ่ม 3%''::text THEN 970::numeric';
  old_group5 text := 'WHEN COALESCE(sd.staff_group, ''''::text) ~~* ''กลุ่ม 5%''::text THEN 970::numeric';
BEGIN
  v := pg_get_viewdef('public.v_logs'::regclass, true);
  IF position(old_units in v) > 0 THEN
    v := replace(v, old_units, 'ARRAY[''งานการพยาบาลไตเทียม''::text]');
  END IF;
  IF position(old_800 in v) > 0 THEN v := replace(v, old_800, ''); END IF;
  IF position(old_head_group in v) > 0 THEN
    v := replace(v, old_head_group, 'WHEN COALESCE(sd.org_role, ''''::text) ~~* ''%หัวหน้ากลุ่มงาน%''::text THEN 1210::numeric');
  END IF;
  IF position(old_head_unit in v) > 0 THEN
    v := replace(v, old_head_unit, 'WHEN COALESCE(sd.org_role, ''''::text) ~~* ''%หัวหน้างาน%''::text THEN 1210::numeric');
  END IF;
  IF position(old_group3 in v) > 0 THEN
    v := replace(v, old_group3, 'WHEN COALESCE(sd.staff_group, ''''::text) ~~* ''กลุ่ม 3%''::text THEN 730::numeric');
  END IF;
  IF position(old_group5 in v) > 0 THEN
    v := replace(v, old_group5, 'WHEN COALESCE(sd.staff_group, ''''::text) ~~* ''กลุ่ม 5%''::text THEN 610::numeric');
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_logs AS ' || v;
END $$;

DO $$
DECLARE
  v text;
  old_units text := '''งานการพยาบาลผู้ป่วยในอายุรกรรมชาย'',
            ''งานการพยาบาลผู้ป่วยในพิเศษปาริฉัตร'',
            ''งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย'',
            ''งานการพยาบาลผู้ป่วยออร์โธปิดิกส์'',
            ''งานการพยาบาลเคมีบำบัด'',
            ''งานการพยาบาลไตเทียม''';
  old_800 text := 'when m = DATE ''2026-10-01''
          and d.unit_name in (
            ''งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย'',
            ''งานการพยาบาลผู้ป่วยในหลอดเลือดสมอง''
          )
          and d.position = ''พนักงานช่วยเหลือคนไข้''
          then 800';
  old_base text := 'when m = DATE ''2026-10-01'' then g.guarantee - (case
          when coalesce(d.org_role, '''') ilike ''%หัวหน้ากลุ่มงาน%'' or d.position = ''หัวหน้ากลุ่มงานการพยาบาล'' then 240
          when coalesce(d.org_role, '''') ilike ''%หัวหน้างาน%'' or d.position = ''หัวหน้าหอผู้ป่วย/หัวหน้างาน'' then 120
          else 0 end) + 10';
  new_base text := 'when m = DATE ''2026-10-01'' then case
          when coalesce(d.org_role, '''') ilike ''%หัวหน้า%'' or d.position in (''หัวหน้ากลุ่มงานการพยาบาล'', ''หัวหน้าหอผู้ป่วย/หัวหน้างาน'') then 1210
          when pos.pay_group in (1, 2) then 1210
          when pos.pay_group = 3 then 730
          when pos.pay_group in (4, 5) then 610
          else g.guarantee + 10 end';
BEGIN
  SELECT pg_get_functiondef('public.p4p_calc(date)'::regprocedure) INTO v;
  IF position(old_units in v) > 0 THEN
    v := replace(v, old_units, '''งานการพยาบาลไตเทียม''');
  END IF;
  IF position(old_800 in v) > 0 THEN v := replace(v, old_800, ''); END IF;
  IF position(old_base in v) > 0 THEN v := replace(v, old_base, new_base); END IF;
  EXECUTE v;
END $$;
