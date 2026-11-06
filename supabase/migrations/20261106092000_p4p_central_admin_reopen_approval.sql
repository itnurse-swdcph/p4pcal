create or replace function public.p4p_reopen_own_activity_approval(
  p_log_id bigint,
  p_reason text default 'ผู้รับรองยกเลิกการรับรองเพื่อทบทวนรายการอีกครั้ง'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  l public.logs%rowtype;
  v_month date;
  v_owner uuid;
  v_reason text;
  v_is_central_admin boolean;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบก่อนดำเนินการ'; end if;

  select exists (
    select 1 from public.profiles me
    where me.user_id = auth.uid()
      and me.role = 'admin'
      and me.username = '11450'
      and me.staff_directory_id is null
  ) into v_is_central_admin;

  select * into l from public.logs where id = p_log_id for update;
  if not found then raise exception 'ไม่พบกิจกรรมที่ต้องการแก้ไขการรับรอง'; end if;
  if l.status <> 'approved' then raise exception 'ยกเลิกการรับรองได้เฉพาะกิจกรรมที่รับรองแล้ว'; end if;

  if l.reviewed_by is distinct from auth.uid() and not v_is_central_admin then
    raise exception 'ยกเลิกได้เฉพาะผู้รับรองล่าสุดหรือแอดมินกลาง 11450';
  end if;

  if not public.can_approve_person(l.person_id) then
    raise exception 'ไม่มีสิทธิ์จัดการการรับรองกิจกรรมของบุคลากรนี้';
  end if;

  v_month := date_trunc('month', l.work_date)::date;
  if exists (select 1 from public.p4p_closed_months where month = v_month)
     or exists (select 1 from public.p4p_monthly_reviews where month = v_month and status = 'reviewing') then
    raise exception 'งวดนี้อยู่ระหว่างรับรองหรือปิดงวดแล้ว ไม่สามารถยกเลิกการรับรองได้';
  end if;

  v_reason := left(trim(coalesce(nullif(p_reason, ''), 'ผู้รับรองยกเลิกการรับรองเพื่อทบทวนรายการอีกครั้ง')), 500);
  select user_id into v_owner from public.people where id = l.person_id;
  perform set_config('p4p.committee_audit', p_log_id::text, true);

  update public.logs
  set status = 'pending', reject_reason = null, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_log_id;

  insert into public.p4p_activity_audit_events(log_id, month, actor_id, person_id, action, reason, old_status, new_status)
  values (l.id, v_month, auth.uid(), l.person_id, 'reopen_approval', v_reason, 'approved', 'pending');

  delete from public.p4p_unit_reviews ur
  using public.p4p_month_submissions s, public.people p
  where ur.submission_id = s.id and p.id = l.person_id and s.month = v_month
    and (
      (s.scope_type = 'unit' and s.unit_id = p.unit_id)
      or (s.scope_type = 'group' and exists (
        select 1 from public.staff_directory d
        where d.source_row = p.staff_directory_id and d.unit_name is null
          and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
          and (trim(coalesce(d.nursing_group, '')) = s.group_name
            or s.group_name = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names, ''), '[,;|]')))
      ))
    );

  if v_owner is not null then
    insert into public.p4p_user_notifications(user_id, title, body, entity_type, entity_id)
    values (v_owner, 'ผู้รับรองยกเลิกการรับรองกิจกรรม',
      'กิจกรรมรายการหนึ่งถูกนำกลับไปรอตรวจรับรองอีกครั้ง โดยไม่มีการปลดล็อกกิจกรรมอื่น',
      'activity', l.id);
  end if;
  return jsonb_build_object('ok', true, 'log_id', l.id, 'new_status', 'pending');
end;
$function$;

revoke all on function public.p4p_reopen_own_activity_approval(bigint, text) from public;
grant execute on function public.p4p_reopen_own_activity_approval(bigint, text) to authenticated;