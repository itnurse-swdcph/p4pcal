create or replace function public.p4p_calc(p_month date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m date := date_trunc('month', p_month)::date;
  prev date := (date_trunc('month', p_month) - interval '1 month')::date;
  g public.pay_groups;
  res jsonb;
  groups jsonb := '[]'::jsonb;
  lines jsonb := '[]'::jsonb;
  persons jsonb;
  cx numeric;
  stored jsonb;
  pend int;
  calendar_work_days numeric := 0;
begin
  if public.my_role() not in ('committee','admin') then
    raise exception 'ไม่มีสิทธิ์ดูผลการคำนวณ';
  end if;

  select result into stored from public.p4p_closed_months where month = m;
  if stored is not null then
    return stored || jsonb_build_object('closed', true);
  end if;

  -- วันทำการตามปฏิทิน: จันทร์-ศุกร์ และใช้ override ที่ตั้งค่าไว้แทนค่าเริ่มต้น
  select count(*)::numeric
    into calendar_work_days
  from generate_series(m, (m + interval '1 month - 1 day')::date, interval '1 day') as day_series(day_date)
  left join public.p4p_calendar_overrides o on o.calendar_date = day_series.day_date
  where coalesce(o.is_working_day, extract(isodow from day_series.day_date) between 1 and 5);

  for g in select * from public.pay_groups order by id loop
    cx := 0;
    select coalesce(extra,0) into cx
    from public.p4p_carry where pay_group = g.id and month = prev;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(p.id::text, 'dir:' || d.source_row::text),
      'eligible', (coalesce(e.eligible, true) and coalesce(wd.work_days, 0) >= 15),
      'work_days', coalesce(wd.work_days, 0),
      'eligibility_reason', case
        when not coalesce(e.eligible, true) then coalesce(nullif(e.note,''), 'กำหนดไม่มีสิทธิ์โดยผู้ดูแลระบบ')
        when coalesce(wd.work_days, 0) >= 15 then 'ผ่านเกณฑ์: ปฏิบัติงาน ' || coalesce(wd.work_days,0)::text || ' วัน (เกณฑ์ 15 วัน)'
        else 'ไม่ผ่านเกณฑ์: ปฏิบัติงาน ' || coalesce(wd.work_days,0)::text || ' วัน (ต้องไม่น้อยกว่า 15 วัน)'
      end,
      'quality_pass', true,
      'points', coalesce(pt.pts, 0),
      'guarantee', case
        when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then g.guarantee - 240
        when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then g.guarantee - 120
        else g.guarantee end,
      'cap', case
        when m = DATE '2026-10-01' then g.guarantee - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end) + 10
        else (g.guarantee * g.cap_mult) - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end)
      end
    ) order by d.first_name, d.last_name), '[]'::jsonb)
    into persons
    from public.staff_directory d
    join public.positions pos on pos.name = d.position
    left join public.units u on trim(u.name) = trim(d.unit_name)
    left join lateral (
      select pp.*
      from public.people pp
      where pp.staff_directory_id = d.source_row
         or (pp.staff_directory_id is null and pp.unit_id = u.id
             and pp.name = trim(d.prefix) || trim(d.first_name) || ' ' || trim(d.last_name))
      order by (pp.staff_directory_id = d.source_row) desc nulls last
      limit 1
    ) p on true
    left join public.person_eligibility e on e.person_id = p.id and e.month = m
    left join lateral (
      select
        count(distinct (vl.work_date, vl.shift))::numeric as approved_shifts,
        coalesce((
          select sum(coalesce(ml.personal_leave_days, 0)
                   + coalesce(ml.sick_leave_days, 0)
                   + coalesce(ml.annual_leave_days, 0))
          from public.p4p_monthly_leave ml
          where ml.staff_directory_id = d.source_row
            and ml.month = m
        ), 0)::numeric as leave_days
      from public.v_logs vl
      where vl.person_id = p.id
        and vl.month = m
        and vl.status = 'approved'
    ) raw_work on true
    left join lateral (
      select least(
        coalesce(raw_work.approved_shifts, 0),
        greatest(0, calendar_work_days - coalesce(raw_work.leave_days, 0))
      )::numeric as work_days
    ) wd on true
    left join (
      select person_id, sum(counted_points) pts
      from public.v_logs where month = m and status = 'approved'
      group by person_id
    ) pt on pt.person_id = p.id
    where d.active and pos.pay_group = g.id and d.source_row <> 2;

    res := public.p4p_alloc(g, persons, cx, 0);
    groups := groups || jsonb_build_array((res - 'lines') || jsonb_build_object(
      'pay_group', g.id, 'name', g.name, 'guarantee', g.guarantee, 'full_amount', g.full_amount,
      'carry_extra_in', cx, 'carry_quality_in', 0
    ));
    lines := lines || (res->'lines');
  end loop;

  select coalesce(jsonb_agg(l.v || jsonb_build_object(
    'name', coalesce(p.name, trim(d.prefix) || trim(d.first_name) || ' ' || trim(d.last_name)),
    'position', coalesce(p.position, d.position),
    'unit_id', coalesce(p.unit_id, u.id),
    'unit_name', u.name,
    'pay_group', pos.pay_group,
    'staff_directory_id', d.source_row
  ) order by pos.pay_group, u.name, coalesce(p.name, d.first_name)), '[]'::jsonb)
  into lines
  from jsonb_array_elements(lines) l(v)
  left join public.people p on p.id::text = l.v->>'id'
  left join public.staff_directory d on
    (l.v->>'id') = 'dir:' || d.source_row::text
    or p.staff_directory_id = d.source_row
    or (p.staff_directory_id is null and trim(d.prefix) || trim(d.first_name) || ' ' || trim(d.last_name) = p.name
        and trim(d.unit_name) = (select uu.name from public.units uu where uu.id = p.unit_id))
  left join public.units u on u.id = coalesce(p.unit_id, (select uu.id from public.units uu where trim(uu.name) = trim(d.unit_name) limit 1))
  left join public.positions pos on pos.name = coalesce(p.position, d.position);

  select count(*) into pend from public.v_logs where month = m and status = 'pending';
  return jsonb_build_object('month', m, 'closed', false, 'groups', groups, 'lines', lines,
    'warnings', jsonb_build_object('quality_missing_units', '[]'::jsonb, 'pending_rows', pend,
      'prev_closed', exists(select 1 from public.p4p_closed_months where month = prev),
      'any_closed', exists(select 1 from public.p4p_closed_months)));
end
$function$;