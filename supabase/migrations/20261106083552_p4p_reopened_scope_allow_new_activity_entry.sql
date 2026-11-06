-- When a unit/group submission is explicitly reopened, allow every staff
-- member who can_write_person() for their own person row to INSERT new logs.
-- Other write restrictions remain unchanged.
do $migration$
declare
  v_def text;
  v_anchor text;
  v_insert_bypass text;
begin
  select pg_get_functiondef('public.guard_p4p_submission_lock()'::regprocedure) into v_def;
  v_anchor := '  -- Reopened scopes remain locked for activity entry/edit. Only an authorized';
  if position(v_anchor in v_def) = 0 then
    raise exception 'guard_p4p_submission_lock insertion point not found';
  end if;
  v_insert_bypass := $code$
  -- Explicitly reopened scopes allow new activity entry for all authorized staff.
  if tg_op = 'INSERT'
     and public.can_write_person(new.person_id)
     and exists (
       select 1 from public.p4p_month_submissions s
       join public.people p on p.id = new.person_id
       left join public.staff_directory d on d.source_row = p.staff_directory_id
       where s.month = date_trunc('month', new.work_date)::date
         and s.status = 'reopened'
         and (
           (s.scope_type = 'unit' and s.unit_id = p.unit_id)
           or (s.scope_type = 'group' and d.unit_name is null
             and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
             and (trim(coalesce(d.nursing_group, '')) = s.group_name
               or s.group_name = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names, ''), '[,;|]')))
           )
         )
     ) then
    return new;
  end if;

$code$;
  v_def := replace(v_def, v_anchor, v_insert_bypass || v_anchor);
  execute v_def;
end
$migration$;
