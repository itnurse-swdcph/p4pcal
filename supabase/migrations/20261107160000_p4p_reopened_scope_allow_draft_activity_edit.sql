-- Allow activity entry to continue after a unit/group submission is explicitly reopened.
-- Only draft rows may be edited/deleted; UPDATE cannot move a row to another person/month.
CREATE OR REPLACE FUNCTION public.guard_p4p_submission_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if tg_op = 'DELETE' then return old; else return new; end if;
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
    if tg_op = 'DELETE' then return old; else return new; end if;
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
      and s.status in ('submitted', 'returned', 'resubmitted', 'reviewed', 'reopened')
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

  -- An explicitly reopened unit/group may add, edit and submit draft activities again.
  -- Keep the person and month fixed on UPDATE; can_write_person and RLS still enforce ownership/scope.
  if (
       (tg_op = 'INSERT' and public.can_write_person(new.person_id))
       or (tg_op = 'UPDATE'
           and old.status = 'draft'
           and new.status in ('draft', 'pending')
           and old.person_id is not distinct from new.person_id
           and date_trunc('month', old.work_date)::date is not distinct from date_trunc('month', new.work_date)::date
           and public.can_write_person(old.person_id))
       or (tg_op = 'DELETE'
           and old.status = 'draft'
           and public.can_write_person(old.person_id))
     )
     and exists (
       select 1
       from public.p4p_month_submissions s
       join public.people p on p.id = case when tg_op = 'DELETE' then old.person_id else new.person_id end
       left join public.staff_directory d on d.source_row = p.staff_directory_id
       where s.month = date_trunc('month', case when tg_op = 'DELETE' then old.work_date else new.work_date end)::date
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
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Reopened scopes remain locked for activity entry/edit. Only an authorized
  -- certifier may change a pending row's approval status, without changing data.
  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status in ('approved', 'rejected')
     and old.person_id is not distinct from new.person_id
     and date_trunc('month', old.work_date)::date is not distinct from date_trunc('month', new.work_date)::date
     and (new.person_id, new.work_date, new.activity_code, new.qty, new.role, new.evidence,
          new.evidence_image_path, new.sub_activity, new.shift, new.parent_log_id, new.supplemental_reason)
       is not distinct from
         (old.person_id, old.work_date, old.activity_code, old.qty, old.role, old.evidence,
          old.evidence_image_path, old.sub_activity, old.shift, old.parent_log_id, old.supplemental_reason)
     and public.can_approve_person(old.person_id)
     and exists (
       select 1 from public.p4p_month_submissions s
       join public.people p on p.id = old.person_id
       left join public.staff_directory d on d.source_row = p.staff_directory_id
       where s.month = date_trunc('month', old.work_date)::date
         and (
           s.status = 'reopened'
           or exists (
             select 1
             from public.p4p_activity_audit_events e
             where e.log_id = old.id
               and e.action = 'return_for_correction'
               and e.new_status = 'pending'
               and e.id = (
                 select e2.id
                 from public.p4p_activity_audit_events e2
                 where e2.log_id = old.id
                 order by e2.created_at desc, e2.id desc
                 limit 1
               )
           )
         )
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

  if not v_locked then
    if tg_op = 'DELETE' then return old; else return new; end if;
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
