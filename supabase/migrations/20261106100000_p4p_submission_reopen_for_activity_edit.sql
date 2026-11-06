-- Reopen a submitted scope before allowing certification edits.
-- The reopened state is intentionally excluded from p4p_is_submission_locked
-- and guard_p4p_submission_lock status lists, so logs become editable only
-- after an authorized head/admin explicitly reopens the submission.

create or replace function public.p4p_cancel_submission_for_activity_edit(
  p_month date,
  p_unit_id integer default null,
  p_group_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_profile public.profiles%rowtype;
  v_submission public.p4p_month_submissions%rowtype;
  v_group text := trim(coalesce(p_group_name, ''));
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select * into v_profile from public.profiles where user_id = auth.uid();
  if not found then raise exception 'ไม่พบโปรไฟล์ผู้ใช้งาน'; end if;
  if v_profile.role not in ('head', 'group_head', 'admin') then
    raise exception 'ไม่มีสิทธิ์ยกเลิกส่งผลงาน';
  end if;
  if v_profile.role = 'admin' and not (v_profile.username = '11450' and v_profile.staff_directory_id is null) then
    raise exception 'อนุญาตเฉพาะแอดมินกลาง 11450';
  end if;
  if p_month is null or date_trunc('month', p_month)::date <> p_month then
    raise exception 'ระบุเดือนในรูปแบบวันแรกของเดือน';
  end if;
  if exists (select 1 from public.p4p_closed_months where month = p_month)
     or exists (select 1 from public.p4p_monthly_reviews where month = p_month and status = 'reviewing') then
    raise exception 'งวดนี้อยู่ระหว่างรับรองหรือปิดงวดแล้ว ไม่สามารถยกเลิกส่งผลงานได้';
  end if;

  if p_unit_id is not null then
    if v_profile.role <> 'admin' and not (p_unit_id = any(array(select public.my_units()))) then
      raise exception 'คุณไม่มีสิทธิ์จัดการการส่งผลงานของหน่วยงานนี้';
    end if;
    select * into v_submission from public.p4p_month_submissions
      where month = p_month and scope_type = 'unit' and unit_id = p_unit_id for update;
  else
    if v_group = '' then raise exception 'กรุณาระบุกลุ่มงาน'; end if;
    if v_profile.role <> 'admin' and not exists (
      select 1 from public.staff_directory d
      where d.source_row = v_profile.staff_directory_id and d.active = true
        and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
        and (trim(coalesce(d.nursing_group, '')) = v_group
          or v_group = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names, ''), '[,;|]')))
    ) then
      raise exception 'คุณไม่มีสิทธิ์จัดการการส่งผลงานของกลุ่มงานนี้';
    end if;
    select * into v_submission from public.p4p_month_submissions
      where month = p_month and scope_type = 'group' and group_name = v_group for update;
  end if;

  if not found then raise exception 'ไม่พบรายการส่งผลงานของขอบเขตนี้'; end if;
  if v_submission.status not in ('submitted', 'resubmitted', 'reviewed') then
    raise exception 'สถานะผลงานไม่อนุญาตให้ยกเลิกส่ง';
  end if;

  update public.p4p_month_submissions
    set status = 'reopened', updated_at = now()
    where id = v_submission.id;
  insert into public.p4p_submission_events(submission_id, event_type, actor_id, details)
    values (v_submission.id, 'reopened_for_activity_edit', auth.uid(),
      jsonb_build_object('previous_status', v_submission.status, 'new_status', 'reopened'));
  return jsonb_build_object('ok', true, 'submission_id', v_submission.id, 'status', 'reopened');
end;
$function$;

revoke all on function public.p4p_cancel_submission_for_activity_edit(date, integer, text) from public;
grant execute on function public.p4p_cancel_submission_for_activity_edit(date, integer, text) to authenticated;

create or replace function public.p4p_resubmit_reopened_month(
  p_month date,
  p_unit_id integer default null,
  p_group_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_profile public.profiles%rowtype;
  v_submission public.p4p_month_submissions%rowtype;
  v_group text := trim(coalesce(p_group_name, ''));
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select * into v_profile from public.profiles where user_id = auth.uid();
  if not found then raise exception 'ไม่พบโปรไฟล์ผู้ใช้งาน'; end if;
  if v_profile.role not in ('head', 'group_head', 'admin') then raise exception 'ไม่มีสิทธิ์ส่งผลงาน'; end if;
  if v_profile.role = 'admin' and not (v_profile.username = '11450' and v_profile.staff_directory_id is null) then
    raise exception 'อนุญาตเฉพาะแอดมินกลาง 11450';
  end if;

  if p_unit_id is not null then
    if v_profile.role <> 'admin' and not (p_unit_id = any(array(select public.my_units()))) then
      raise exception 'คุณไม่มีสิทธิ์ส่งผลงานของหน่วยงานนี้';
    end if;
    select * into v_submission from public.p4p_month_submissions
      where month = p_month and scope_type = 'unit' and unit_id = p_unit_id for update;
  else
    if v_group = '' then raise exception 'กรุณาระบุกลุ่มงาน'; end if;
    if v_profile.role <> 'admin' and not exists (
      select 1 from public.staff_directory d
      where d.source_row = v_profile.staff_directory_id and d.active = true
        and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
        and (trim(coalesce(d.nursing_group, '')) = v_group
          or v_group = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names, ''), '[,;|]')))
    ) then
      raise exception 'คุณไม่มีสิทธิ์ส่งผลงานของกลุ่มงานนี้';
    end if;
    select * into v_submission from public.p4p_month_submissions
      where month = p_month and scope_type = 'group' and group_name = v_group for update;
  end if;
  if not found or v_submission.status <> 'reopened' then
    raise exception 'ไม่พบรายการที่เปิดให้แก้ไข หรือสถานะไม่ถูกต้อง';
  end if;

  -- The existing submit routine accepts a committee-returned scope. Move this
  -- reopened scope to that intermediate state inside this transaction, then
  -- reuse its complete readiness and permission checks. Any failure rolls back.
  update public.p4p_month_submissions set status = 'returned', updated_at = now()
    where id = v_submission.id;
  return public.p4p_submit_month_v2(p_month, p_unit_id, p_group_name);
end;
$function$;

revoke all on function public.p4p_resubmit_reopened_month(date, integer, text) from public;
grant execute on function public.p4p_resubmit_reopened_month(date, integer, text) to authenticated;

create or replace function public.p4p_reopen_own_activity_approval(
  p_log_id bigint,
  p_reason text default 'ผู้มีสิทธิ์ในหน่วยงานยกเลิกการรับรองเพื่อทบทวนรายการอีกครั้ง'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  l public.logs%rowtype;
  v_month date;
  v_owner uuid;
  v_reason text;
  v_submission_status text;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบก่อนดำเนินการ'; end if;

  select * into l from public.logs where id = p_log_id for update;
  if not found then raise exception 'ไม่พบกิจกรรมที่ต้องการแก้ไขการรับรอง'; end if;
  if l.status <> 'approved' then raise exception 'แก้ไขการรับรองได้เฉพาะกิจกรรมที่รับรองแล้ว'; end if;
  if not public.can_approve_person(l.person_id) then
    raise exception 'ไม่มีสิทธิ์รับรองกิจกรรมของบุคลากรนี้';
  end if;

  v_month := date_trunc('month', l.work_date)::date;
  if exists (select 1 from public.p4p_closed_months where month = v_month)
     or exists (select 1 from public.p4p_monthly_reviews where month = v_month and status = 'reviewing') then
    raise exception 'งวดนี้อยู่ระหว่างรับรองหรือปิดงวดแล้ว ไม่สามารถแก้ไขการรับรองได้';
  end if;

  select s.status into v_submission_status
  from public.p4p_month_submissions s
  join public.people p on p.id = l.person_id
  where s.month = v_month
    and ((s.scope_type = 'unit' and s.unit_id = p.unit_id)
      or (s.scope_type = 'group' and exists (
        select 1 from public.staff_directory d
        where d.source_row = p.staff_directory_id and d.unit_name is null
          and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
          and (trim(coalesce(d.nursing_group, '')) = s.group_name
            or s.group_name = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names, ''), '[,;|]')))
      )))
  limit 1;
  if v_submission_status in ('submitted', 'resubmitted', 'reviewed', 'returned') then
    raise exception 'หน่วยงานส่งผลงานแล้ว กรุณากดยกเลิกส่งผลงานก่อนจึงจะแก้ไขการรับรองกิจกรรมได้';
  end if;

  v_reason := left(trim(coalesce(nullif(p_reason, ''), 'ผู้มีสิทธิ์ในหน่วยงานยกเลิกการรับรองเพื่อทบทวนรายการอีกครั้ง')), 500);
  select user_id into v_owner from public.people where id = l.person_id;
  perform set_config('p4p.committee_audit', p_log_id::text, true);

  update public.logs
    set status = 'pending', reject_reason = null, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_log_id;

  insert into public.p4p_activity_audit_events(log_id, month, actor_id, person_id, action, reason, old_status, new_status)
    values (l.id, v_month, auth.uid(), l.person_id, 'reopen_approval', v_reason, 'approved', 'pending');

  if v_owner is not null then
    insert into public.p4p_user_notifications(user_id, title, body, entity_type, entity_id)
      values (v_owner, 'มีการแก้ไขการรับรองกิจกรรม', 'กิจกรรมรายการหนึ่งถูกนำกลับไปรอรับรองอีกครั้ง', 'activity', l.id);
  end if;
  return jsonb_build_object('ok', true, 'log_id', l.id, 'new_status', 'pending');
end;
$function$;

revoke all on function public.p4p_reopen_own_activity_approval(bigint, text) from public;
grant execute on function public.p4p_reopen_own_activity_approval(bigint, text) to authenticated;
