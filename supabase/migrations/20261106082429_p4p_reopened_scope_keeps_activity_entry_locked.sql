-- Keep the scope locked for staff activity entry while allowing authorized
-- certifiers to approve/reject pending activities after an explicit reopen.
do $migration$
declare v_def text; v_old text; v_new text; v_bypass text;
begin
 select pg_get_functiondef('public.p4p_is_submission_locked(uuid,date)'::regprocedure) into v_def;
 v_old := 's.status in (''submitted'',''returned'',''resubmitted'',''reviewed'')';
 v_new := 's.status in (''submitted'',''returned'',''resubmitted'',''reviewed'',''reopened'')';
 if position(v_old in v_def)=0 then raise exception 'status condition not found in p4p_is_submission_locked'; end if;
 execute replace(v_def,v_old,v_new);

 select pg_get_functiondef('public.guard_p4p_submission_lock()'::regprocedure) into v_def;
 v_old := 's.status in (''submitted'', ''returned'', ''resubmitted'', ''reviewed'')';
 v_new := 's.status in (''submitted'', ''returned'', ''resubmitted'', ''reviewed'', ''reopened'')';
 if position(v_old in v_def)=0 then raise exception 'status condition not found in guard_p4p_submission_lock'; end if;
 v_def:=replace(v_def,v_old,v_new);
 v_bypass := $code$
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
 if position('  if not v_locked then' in v_def)=0 then raise exception 'guard insertion point not found'; end if;
 v_def:=replace(v_def,'  if not v_locked then',v_bypass || '  if not v_locked then');
 execute v_def;
end
$migration$;
