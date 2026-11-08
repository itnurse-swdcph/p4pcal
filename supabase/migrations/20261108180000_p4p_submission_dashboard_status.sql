-- Read-only dashboard status for the owner of a submitted unit/group.
-- Exposes reviewer identity/time and the full correction history for this submission.
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
  v_group text;
  v_allowed boolean := false;
  v_review jsonb;
  v_returns jsonb;
begin
  if auth.uid() is null then
    raise exception 'กรุณาเข้าสู่ระบบ';
  end if;

  select * into s from public.p4p_month_submissions where id = p_submission_id;
  if not found then raise exception 'ไม่พบรายการส่งผลงาน'; end if;

  select staff_directory_id into v_staff_id
  from public.profiles where user_id = auth.uid();
  v_role := public.my_role();

  if v_role in ('admin', 'committee') then
    v_allowed := true;
  elsif v_staff_id is not null then
    select unit_name, nursing_group into v_unit_name, v_group
    from public.staff_directory where source_row = v_staff_id and active is true;

    if s.scope_type = 'unit' then
      select name into v_unit_name from public.units where id = s.unit_id;
      v_allowed := public.my_role() = 'head'
        and exists (select 1 from public.staff_directory d
          where d.source_row = v_staff_id and d.active is true
            and d.org_role ilike '%หัวหน้างาน%'
            and trim(coalesce(d.unit_name,'')) = trim(coalesce(v_unit_name,'')));
    else
      v_allowed := public.my_role() in ('group_head','head')
        and exists (select 1 from public.staff_directory d
          where d.source_row = v_staff_id and d.active is true
            and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
            and (trim(coalesce(d.nursing_group,'')) = trim(coalesce(s.group_name,''))
              or trim(coalesce(s.group_name,'')) = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''), '[,;|]'))));
    end if;
  end if;

  if not v_allowed then raise exception 'ไม่มีสิทธิ์ดูสถานะส่งผลงานของหน่วยงานนี้'; end if;

  select jsonb_build_object(
    'reviewed_by_name', r.reviewed_by_name,
    'reviewed_at', r.reviewed_at
  ) into v_review
  from public.p4p_unit_reviews r where r.submission_id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'staff_directory_id', r.staff_directory_id,
    'person_name', coalesce(nullif(trim(concat_ws(' ', d.prefix, d.first_name, d.last_name)), ''), 'ไม่พบชื่อบุคลากร'),
    'reason', r.reason,
    'status', r.status,
    'returned_at', r.returned_at,
    'corrected_at', r.corrected_at
  ) order by r.returned_at desc, r.id desc), '[]'::jsonb)
  into v_returns
  from public.p4p_submission_returns r
  left join public.staff_directory d on d.source_row = r.staff_directory_id
  where r.submission_id = s.id;

  return jsonb_build_object('review', coalesce(v_review, 'null'::jsonb), 'returns', v_returns);
end;
$function$;

revoke all on function public.p4p_submission_dashboard_status(uuid) from public, anon;
grant execute on function public.p4p_submission_dashboard_status(uuid) to authenticated;
