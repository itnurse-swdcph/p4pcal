-- Only the latest individual committee return may unlock supervisor approval.
do $$
declare
  v_def text;
  v_old text := $old$or exists (
             select 1
             from public.p4p_submission_returns r
             where r.submission_id = s.id
               and r.staff_directory_id = v_sd
               and r.status = 'corrected'
           )$old$;
  v_new text := $new$or exists (
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
           )$new$;
begin
  v_def := pg_get_functiondef('public.guard_p4p_submission_lock()'::regprocedure);
  if position(v_old in v_def) = 0 then
    raise exception 'ไม่พบเงื่อนไข corrected return ที่คาดไว้';
  end if;
  execute replace(v_def, v_old, v_new);
end
$$;
