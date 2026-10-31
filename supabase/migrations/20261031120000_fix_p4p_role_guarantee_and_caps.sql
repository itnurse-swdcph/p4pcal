-- Fix role guarantee allocation and keep the October 2026 +10 monthly cap.
-- Role guarantee is part of the total score, not an additional score above the cap.
-- October 2026 remains activity caps of 970/1090/1210/730/610 respectively;
-- these are enforced by the existing v_logs monthly cap and are intentionally unchanged.

do $migration$
declare
  alloc_def text;
  calc_def text;
  old_alloc_cap text := $old$coalesce((e->>'guarantee')::numeric, g.guarantee) * g.cap_mult$old$;
  new_alloc_cap text := $new$g.guarantee * g.cap_mult$new$;
  old_calc text := $old$'guarantee', case
        when d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 960
        when d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 1080
        else g.guarantee end,
      'cap', (case
        when d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 960
        when d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 1080
        else g.guarantee end) * g.cap_mult$old$;
  new_calc text := $new$'guarantee', case
        when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then g.guarantee - 240
        when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then g.guarantee - 120
        else g.guarantee end,
      'cap', (g.guarantee * g.cap_mult) - (case
        when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
        when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
        else 0 end)$new$;
begin
  select pg_get_functiondef('public.p4p_alloc(pay_groups,jsonb,numeric,numeric)'::regprocedure)
    into alloc_def;
  if length(alloc_def) - length(replace(alloc_def, old_alloc_cap, '')) <> 2 * length(old_alloc_cap) then
    raise exception 'Expected exactly two legacy cap expressions in p4p_alloc';
  end if;
  execute replace(alloc_def, old_alloc_cap, new_alloc_cap);

  select pg_get_functiondef('public.p4p_calc(date)'::regprocedure)
    into calc_def;
  if position(old_calc in calc_def) = 0 then
    raise exception 'Legacy role guarantee expression not found in p4p_calc';
  end if;
  execute replace(calc_def, old_calc, new_calc);
end
$migration$;
