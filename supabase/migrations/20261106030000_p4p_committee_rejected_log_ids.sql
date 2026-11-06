-- Lets an activity owner / approver / committee learn which of their draft activities were last rejected
-- by the P4P committee (audit event action='reject', old_status='approved'), without exposing the audit table.
-- Applied to production via MCP as: p4p_committee_rejected_log_ids
create or replace function public.p4p_committee_rejected_log_ids(p_log_ids bigint[])
returns table(log_id bigint)
language sql stable security definer set search_path = public as $$
  select l.id
  from public.logs l
  where l.id = any(p_log_ids[1:2000])
    and (public.my_role() in ('admin','committee') or l.entered_by = auth.uid()
         or public.can_write_person(l.person_id) or public.can_approve_person(l.person_id))
    and (select e.action || ':' || coalesce(e.old_status,'')
           from public.p4p_activity_audit_events e
          where e.log_id = l.id
          order by e.created_at desc, e.id desc limit 1) = 'reject:approved'
$$;
revoke all on function public.p4p_committee_rejected_log_ids(bigint[]) from public;
grant execute on function public.p4p_committee_rejected_log_ids(bigint[]) to authenticated;
