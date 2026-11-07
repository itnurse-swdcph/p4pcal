-- Allow supervisors to approve only the activities of a person
-- whose individual committee return has been corrected and resubmitted.
-- This does not reopen editing or insertion for the rest of the submitted scope.
do $$
declare
  v_def text;
  v_pos integer;
  v_tail text;
  v_old text := 'and s.status = ''reopened''';
  v_new text := $new$and (
           s.status = 'reopened'
           or exists (
             select 1
             from public.p4p_submission_returns r
             where r.submission_id = s.id
               and r.staff_directory_id = v_sd
               and r.status = 'corrected'
           )
         )$new$;
begin
  v_def := pg_get_functiondef('public.guard_p4p_submission_lock()'::regprocedure);
  v_pos := strpos(v_def, 'and public.can_approve_person(old.person_id)');
  if v_pos = 0 then
    raise exception 'ไม่พบเงื่อนไขสิทธิ์ผู้รับรอง ยกเลิก migration';
  end if;

  v_tail := substring(v_def from v_pos);
  if strpos(v_tail, v_old) = 0 then
    raise exception 'ไม่พบเงื่อนไขสถานะ reopened ในบล็อกการรับรอง';
  end if;

  v_tail := replace(v_tail, v_old, v_new);
  v_def := left(v_def, v_pos - 1) || v_tail;
  execute v_def;
end
$$;
