-- Restore the normal role-specific 1.5x cap for all months except October 2026.
-- The October branch remains insurance guarantee + 10.
DO $migration$
DECLARE
  calc_def text;
  old_case text := $old$when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120$old$;
  new_case text := $new$when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120$new$;
BEGIN
  SELECT pg_get_functiondef('public.p4p_calc(date)'::regprocedure) INTO calc_def;
  IF length(calc_def) - length(replace(calc_def, old_case, '')) <> length(old_case) THEN
    RAISE EXCEPTION 'Expected exactly one temporary cap-role condition in public.p4p_calc(date)';
  END IF;
  EXECUTE replace(calc_def, old_case, new_case);
END
$migration$;
