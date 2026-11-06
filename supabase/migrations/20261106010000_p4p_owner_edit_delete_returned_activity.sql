-- Owner may edit/delete an activity that the committee returned for correction (pending + reject_reason + audit event),
-- even when the unit's monthly submission is locked.
create or replace function public.p4p_log_is_returned_for_correction(p_log_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.p4p_activity_audit_events e
    where e.log_id = p_log_id and e.action = 'return_for_correction' and e.new_status = 'pending')
$$;
revoke all on function public.p4p_log_is_returned_for_correction(bigint) from public;
grant execute on function public.p4p_log_is_returned_for_correction(bigint) to authenticated;

do $$
declare d text; n text;
begin
  -- 1) logs_guard: allow DELETE of a returned pending row (ownership still checked below it)
  d := pg_get_functiondef('public.logs_guard'::regproc);
  n := replace(d, $q$if old.status not in ('draft', 'rejected') then$q$,
    $q$if old.status not in ('draft', 'rejected') and not (old.status = 'pending' and length(trim(coalesce(old.reject_reason,''))) > 0 and public.p4p_log_is_returned_for_correction(old.id)) then$q$);
  if n = d then raise exception 'logs_guard anchor not found'; end if;
  execute n;

  -- 2) guard_p4p_submission_lock: returned pending row is editable/deletable by owner despite lock
  d := pg_get_functiondef('public.guard_p4p_submission_lock'::regproc);
  n := replace(d, $q$  if tg_op='UPDATE' and (old.person_id is distinct from new.person_id or date_trunc$q$,
    $q$  if tg_op in ('UPDATE','DELETE') and old.status = 'pending' and length(trim(coalesce(old.reject_reason,''))) > 0
     and public.p4p_log_is_returned_for_correction(old.id)
     and (tg_op = 'DELETE' or (new.status = 'pending' and old.person_id is not distinct from new.person_id
          and date_trunc('month',old.work_date)::date is not distinct from date_trunc('month',new.work_date)::date)) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op='UPDATE' and (old.person_id is distinct from new.person_id or date_trunc$q$);
  if n = d then raise exception 'guard_p4p_submission_lock anchor not found'; end if;
  execute n;
end $$;

alter policy log_del on public.logs using (
  can_write_person(person_id) and (
    status = any (array['draft','rejected'])
    or (status = 'pending' and length(trim(coalesce(reject_reason,''))) > 0 and public.p4p_log_is_returned_for_correction(id))
  )
);
