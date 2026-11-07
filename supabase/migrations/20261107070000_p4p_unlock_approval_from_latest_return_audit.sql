-- Match the real individual-return workflow: it records return_for_correction in p4p_activity_audit_events.
-- Only the latest return event for this log can unlock its approval; can_approve_person and scope checks remain required.
do $$
declare
  v_def text;
  v_old text := $old$or exists (
             select 1
             from public.p4p_submission_returns r
             where r.submission_id = s.id
               and r.staff_directory_id = v_sd
               and r.status = 'corrected'
               and r.id = (
                 select r2.id
                 from public.p4p_submission_returns r2
                 where r2.submission_id = s.id
                   and r2.staff_directory_id = v_sd
                 order by r2.returned_at desc, r2.id desc
                 limit 1
               )
           )$old$;
  v_new text := $new$or exists (
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
           )$new$;
begin
  v_def := pg_get_functiondef('public.guard_p4p_submission_lock()'::regprocedure);
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, v_new);
  elsif position(v_new in v_def) = 0 then
    raise exception 'ไม่พบเงื่อนไข return-audit เดิมหรือใหม่ใน guard trigger';
  end if;
end
$$;
