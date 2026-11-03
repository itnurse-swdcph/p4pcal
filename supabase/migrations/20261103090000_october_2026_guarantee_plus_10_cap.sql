-- October 2026 only: cap each person's performance points at their role-adjusted insurance guarantee + 10.
-- Other months retain the existing 1.5x cap.
DO $migration$
DECLARE
  calc_def text;
  old_cap text := $old$'cap', (g.guarantee * g.cap_mult) - (case
        when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
        when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
        else 0 end)$old$;
  new_cap text := $new$'cap', case
        when m = DATE '2026-10-01' then g.guarantee - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end) + 10
        else (g.guarantee * g.cap_mult) - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end)
      end$new$;
BEGIN
  SELECT pg_get_functiondef('public.p4p_calc(date)'::regprocedure) INTO calc_def;
  IF length(calc_def) - length(replace(calc_def, old_cap, '')) <> length(old_cap) THEN
    RAISE EXCEPTION 'Expected exactly one existing per-person cap expression in public.p4p_calc(date)';
  END IF;
  EXECUTE replace(calc_def, old_cap, new_cap);
END
$migration$;
