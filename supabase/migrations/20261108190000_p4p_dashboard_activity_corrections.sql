-- Include active activity-level committee returns in the unit submission dashboard.
create or replace function public.p4p_submission_dashboard_status(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  s public.p4p_month_submissions%rowtype;
  v_staff_id bigint;
  v_role text;
  v_unit_name text;
  v_allowed boolean := false;
  v_review jsonb;
  v_returns jsonb;
  v_activity_returns jsonb;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select * into s from public.p4p_month_submissions where id = p_submission_id;
  if not found then raise exception 'ไม่พบรายการส่งผลงาน'; end if;

  select staff_directory_id into v_staff_id from public.profiles where user_id = auth.uid();
  v_role := public.my_role();
  if v_role in ('admin', 'committee') then
    v_allowed := true;
  elsif v_staff_id is not null then
    if s.scope_type = 'unit' then
      select name into v_unit_name from public.units where id = s.unit_id;
      v_allowed := v_role = 'head' and exists (
        select 1 from public.staff_directory d
        where d.source_row = v_staff_id and d.active is true
          and d.org_role ilike '%หัวหน้างาน%'
          and trim(coalesce(d.unit_name,'')) = trim(coalesce(v_unit_name,''))
      );
    else
      v_allowed := v_role in ('group_head','head') and exists (
        select 1 from public.staff_directory d
        where d.source_row = v_staff_id and d.active is true
          and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
          and (trim(coalesce(d.nursing_group,'')) = trim(coalesce(s.group_name,''))
            or trim(coalesce(s.group_name,'')) = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''), '[,;|]')))
      );
    end if;
  end if;
  if not v_allowed then raise exception 'ไม่มีสิทธิ์ดูสถานะส่งผลงานของหน่วยงานนี้'; end if;

  select jsonb_build_object('reviewed_by_name', r.reviewed_by_name, 'reviewed_at', r.reviewed_at)
    into v_review from public.p4p_unit_reviews r where r.submission_id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'staff_directory_id', r.staff_directory_id,
    'person_name', coalesce(nullif(trim(concat_ws(' ', d.prefix, d.first_name, d.last_name)), ''), 'ไม่พบชื่อบุคลากร'),
    'reason', r.reason, 'status', r.status, 'returned_at', r.returned_at, 'corrected_at', r.corrected_at,
    'activities', '[]'::jsonb
  ) order by r.returned_at desc, r.id desc), '[]'::jsonb)
  into v_returns
  from public.p4p_submission_returns r
  left join public.staff_directory d on d.source_row = r.staff_directory_id
  where r.submission_id = s.id;

  -- One dashboard row per person, with the active returned activities nested beneath it.
  with latest_events as (
    select distinct on (a.log_id)
      a.log_id, a.person_id, a.action, a.reason, a.old_status, a.created_at
    from public.p4p_activity_audit_events a
    where a.month = s.month and a.action in ('return_for_correction','reject')
    order by a.log_id, a.created_at desc, a.id desc
  ),
  active_returns as (
    select l.id as log_id, l.person_id, l.person_name, l.work_date, l.activity_code, l.title,
      coalesce(nullif(trim(e.reason),''), nullif(trim(l.reject_reason),''), 'ไม่ได้ระบุเหตุผล') as reason,
      e.created_at as returned_at, p.staff_directory_id
    from latest_events e
    join public.v_logs l on l.id = e.log_id
    left join public.people p on p.id = l.person_id
    where e.old_status = 'approved'
      and l.status = case when e.action = 'return_for_correction' then 'pending' else 'draft' end
      and nullif(trim(coalesce(l.reject_reason,'')),'') is not null
      and (
        (s.scope_type = 'unit' and l.unit_id = s.unit_id)
        or
        (s.scope_type = 'group' and p.unit_id is null and exists (
          select 1 from public.staff_directory d
          where d.source_row = p.staff_directory_id and d.active is true
            and (trim(coalesce(d.nursing_group,'')) = trim(coalesce(s.group_name,''))
              or trim(coalesce(s.group_name,'')) = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''), '[,;|]')))
        ))
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'activity-' || x.person_id::text,
    'staff_directory_id', x.staff_directory_id,
    'person_name', max(x.person_name),
    'reason', string_agg(distinct x.reason, ' | '),
    'status', 'returned',
    'returned_at', max(x.returned_at),
    'corrected_at', null,
    'activities', jsonb_agg(jsonb_build_object(
      'log_id', x.log_id, 'work_date', x.work_date, 'activity_code', x.activity_code,
      'title', x.title, 'reason', x.reason, 'returned_at', x.returned_at
    ) order by x.returned_at desc)
  ) order by max(x.returned_at) desc), '[]'::jsonb)
  into v_activity_returns
  from active_returns x
  group by x.person_id, x.staff_directory_id;

  return jsonb_build_object(
    'review', coalesce(v_review, 'null'::jsonb),
    'returns', coalesce(v_returns, '[]'::jsonb) || coalesce(v_activity_returns, '[]'::jsonb)
  );
end;
$function$;