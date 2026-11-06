-- Allow only the owner of an activity rejected by the P4P committee to edit/delete it
-- after the unit submission has been locked, and to resubmit the corrected draft.
create or replace function public.guard_p4p_submission_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_person uuid;
  v_month date;
  v_sd integer;
  v_locked boolean;
  v_allowed boolean;
  v_allowed_additional boolean;
begin
  -- Committee return/reject of an already approved activity.
  if tg_op = 'UPDATE'
     and coalesce(current_setting('p4p.committee_audit', true), '') = old.id::text
     and old.status = 'approved'
     and new.status in ('pending', 'draft')
     and old.person_id is not distinct from new.person_id
     and old.work_date is not distinct from new.work_date
     and old.activity_code is not distinct from new.activity_code
     and old.qty is not distinct from new.qty then
    return new;
  end if;

  -- A committee-rejected activity (audit action reject:approved) is editable
  -- only while it remains a draft, and may be resubmitted after correction.
  -- Ownership is still enforced by logs_guard and the table's RLS policies.
  if tg_op in ('UPDATE', 'DELETE')
     and old.status in ('draft', 'rejected')
     and exists (
       select 1
       from public.p4p_activity_audit_events e
       where e.log_id = old.id
         and e.action = 'reject'
         and e.old_status = 'approved'
         and e.new_status = 'draft'
         and e.id = (
           select e2.id
           from public.p4p_activity_audit_events e2
           where e2.log_id = old.id
           order by e2.created_at desc, e2.id desc
           limit 1
         )
     )
     and (
       tg_op = 'DELETE'
       or (
         new.person_id is not distinct from old.person_id
         and date_trunc('month', new.work_date)::date = date_trunc('month', old.work_date)::date
         and new.status in ('draft', 'pending')
       )
     ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.status = 'pending'
     and length(trim(coalesce(old.reject_reason, ''))) > 0
     and public.p4p_log_is_returned_for_correction(old.id)
     and (
       tg_op = 'DELETE'
       or (
         new.status = 'pending'
         and old.person_id is not distinct from new.person_id
         and date_trunc('month', old.work_date)::date is not distinct from date_trunc('month', new.work_date)::date
       )
     ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE'
     and (old.person_id is distinct from new.person_id
       or date_trunc('month', old.work_date)::date is distinct from date_trunc('month', new.work_date)::date) then
    if public.p4p_is_submission_locked(old.person_id, date_trunc('month', old.work_date)::date)
       or public.p4p_is_submission_locked(new.person_id, date_trunc('month', new.work_date)::date) then
      raise exception 'ไม่สามารถย้ายกิจกรรมไปยังบุคลากรหรือเดือนอื่นหลังส่งผลงานแล้ว';
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_person := old.person_id;
    v_month := date_trunc('month', old.work_date)::date;
  else
    v_person := new.person_id;
    v_month := date_trunc('month', new.work_date)::date;
  end if;

  select p.staff_directory_id into v_sd from public.people p where p.id = v_person;
  select exists (
    select 1 from public.p4p_month_submissions s
    where s.month = v_month
      and s.status in ('submitted', 'returned', 'resubmitted', 'reviewed')
      and (
        (s.scope_type = 'unit' and s.unit_id = (select unit_id from public.people where id = v_person))
        or (s.scope_type = 'group' and exists (
          select 1 from public.staff_directory d
          where d.source_row = v_sd and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
            and (trim(coalesce(d.nursing_group, '')) = s.group_name
              or s.group_name = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names, ''), '[,;|]')))
        ))
      )
  ) into v_locked;

  if not v_locked then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select exists (
    select 1 from public.p4p_submission_returns r
    join public.p4p_month_submissions s on s.id = r.submission_id
    where s.month = v_month and r.staff_directory_id = v_sd and r.status = 'returned'
      and (
        (s.scope_type = 'unit' and s.unit_id = (select unit_id from public.people where id = v_person))
        or (s.scope_type = 'group' and exists (
          select 1 from public.staff_directory d
          where d.source_row = v_sd
            and (trim(coalesce(d.nursing_group, '')) = s.group_name
              or s.group_name = any(regexp_split_to_array(coalesce(d.extra_nursing_group_names, ''), '[,;|]')))
        ))
      )
  ) into v_allowed;

  if v_allowed then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select exists (
    select 1 from public.p4p_person_month_unlocks u
    where u.month = v_month and u.staff_directory_id = v_sd
      and u.status = 'open' and u.person_id = v_person
  ) into v_allowed_additional;

  if v_allowed_additional then
    if tg_op = 'INSERT' then return new; end if;
    if tg_op = 'DELETE' and old.status in ('draft', 'rejected') then return old; end if;
    if tg_op = 'UPDATE' and old.status in ('draft', 'rejected') then return new; end if;
    if tg_op = 'UPDATE' and old.status = 'pending'
       and new.status in ('approved', 'draft', 'rejected')
       and (new.person_id, new.work_date, new.activity_code, new.qty, new.role, new.evidence,
            new.evidence_image_path, new.sub_activity, new.shift, new.parent_log_id, new.supplemental_reason)
         is not distinct from
           (old.person_id, old.work_date, old.activity_code, old.qty, old.role, old.evidence,
            old.evidence_image_path, old.sub_activity, old.shift, old.parent_log_id, old.supplemental_reason) then
      return new;
    end if;
  end if;

  raise exception 'หน่วยงานส่งผลงานประจำเดือนนี้แล้ว รายการถูกล็อก หากต้องแก้ไขต้องรอคณะกรรมการส่งกลับรายบุคคลหรือเปิดสิทธิ์บันทึกเพิ่ม';
end;
$function$;

-- Preserve the committee's rejection reason when the owner resubmits a corrected draft.
create or replace function public.logs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  r text := coalesce(public.my_role(), '');
  uid uuid := auth.uid();
  owner uuid;
  own boolean;
  changed boolean;
  committee_rejected boolean;
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.reject_reason := null;
    new.submitted_at := null;
    new.submitted_by := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    if uid is not null then new.entered_by := uid; end if;
    return new;
  end if;

  if uid is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select p.user_id into owner from public.people p where p.id = old.person_id;
  own := (uid = old.entered_by or uid = owner or r = 'admin');

  if tg_op = 'DELETE' then
    if old.status not in ('draft', 'rejected') and not (old.status = 'pending' and length(trim(coalesce(old.reject_reason, ''))) > 0 and public.p4p_log_is_returned_for_correction(old.id)) then
      raise exception 'รายการที่ส่งแล้วหรือรับรองแล้วถูกล็อก ลบไม่ได้';
    end if;
    if not own then raise exception 'ลบได้เฉพาะรายการที่ตนเองบันทึก'; end if;
    return old;
  end if;

  changed := (new.person_id, new.work_date, new.activity_code, new.qty, new.role,
    new.evidence, new.evidence_image_path, new.sub_activity, new.shift,
    new.parent_log_id, new.supplemental_reason)
    is distinct from
    (old.person_id, old.work_date, old.activity_code, old.qty, old.role,
    old.evidence, old.evidence_image_path, old.sub_activity, old.shift,
    old.parent_log_id, old.supplemental_reason);

  if old.status in ('draft', 'rejected') then
    if not own then raise exception 'แก้ไขหรือส่งได้เฉพาะรายการที่ตนเองบันทึก'; end if;
    if new.status = 'pending' then
      if changed then raise exception 'กรุณาบันทึกการแก้ไขก่อน แล้วจึงกดส่ง'; end if;
      committee_rejected := exists (
        select 1 from public.p4p_activity_audit_events e
        where e.log_id = old.id and e.action = 'reject'
          and e.old_status = 'approved' and e.new_status = 'draft'
          and e.id = (
            select e2.id from public.p4p_activity_audit_events e2
            where e2.log_id = old.id order by e2.created_at desc, e2.id desc limit 1
          )
      );
      new.submitted_at := now();
      new.submitted_by := uid;
      new.reject_reason := case
        when committee_rejected then 'แก้ไขแล้ว รอตรวจซ้ำ: ' || trim(coalesce(old.reject_reason, ''))
        else null
      end;
      new.reviewed_by := null;
      new.reviewed_at := null;
    elsif new.status in ('draft', 'rejected') then
      new.status := 'draft';
    else
      raise exception 'ต้องส่งรายการก่อน จึงจะรับรองได้';
    end if;
    return new;

  elsif old.status = 'pending' then
    if new.status in ('approved', 'rejected') then
      if not public.can_approve_person(old.person_id) then
        raise exception 'ไม่มีสิทธิ์รับรองรายการนี้ ลำดับการรับรอง: เจ้าหน้าที่ → หัวหน้างาน → หัวหน้ากลุ่มงาน → รักษาการหัวหน้าพยาบาล';
      end if;
      if changed then raise exception 'ผู้รับรองมีหน้าที่รับรองหรือไม่รับรองเท่านั้น แก้ไขรายการที่ส่งมาไม่ได้'; end if;
      if new.status = 'rejected' and length(trim(coalesce(new.reject_reason, ''))) = 0 then
        raise exception 'กรุณาระบุเหตุผลที่ไม่รับรอง';
      end if;
      if new.status = 'rejected' then
        insert into public.p4p_activity_audit_events(log_id, month, actor_id, person_id, action, reason, old_status, new_status)
        values(old.id, date_trunc('month', old.work_date)::date, uid, old.person_id, 'reject', trim(new.reject_reason), 'pending', 'draft');
        new.status := 'draft';
      elsif new.status = 'approved' then
        new.reject_reason := null;
      end if;
      new.reviewed_by := uid;
      new.reviewed_at := now();
      return new;
    elsif new.status = 'pending' then
      if not own then raise exception 'แก้ไขรายการที่รอรับรองได้เฉพาะผู้บันทึกเท่านั้น'; end if;
      return new;
    else
      raise exception 'รายการที่ส่งแล้วถูกล็อก แก้ไขหรือลบไม่ได้';
    end if;

  elsif old.status = 'approved' then
    if coalesce(current_setting('p4p.committee_audit', true), '') = old.id::text
       and new.status in ('pending', 'draft') and not changed then
      new.reviewed_by := uid;
      new.reviewed_at := now();
      return new;
    end if;
    if new.status = 'pending' and exists (
      select 1 from public.p4p_submission_returns r
      join public.p4p_month_submissions s on s.id = r.submission_id
      where r.staff_directory_id = (select staff_directory_id from public.people where id = old.person_id)
        and r.status = 'returned' and s.month = date_trunc('month', old.work_date)::date
    ) then
      new.reviewed_by := uid;
      new.reviewed_at := now();
      new.reject_reason := coalesce(nullif(trim(new.reject_reason), ''), 'ส่งกลับแก้ไขรายบุคคล');
      return new;
    end if;
    raise exception 'รายการที่รับรองแล้วถูกล็อก แก้ไขไม่ได้ เว้นแต่คณะกรรมการส่งกลับรายบุคคล';
  end if;

  raise exception 'รายการที่รับรองแล้วถูกล็อก แก้ไขหรือลบไม่ได้';
end;
$function$;
