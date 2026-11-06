-- Include the latest certifier identity in activity rows so the UI can
-- expose the reopen action only to the person who performed that approval.
create or replace function public.get_v_logs_month_json(
  p_start date,
  p_end date,
  p_unit_id bigint default null,
  p_person_ids uuid[] default null
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $function$
  select coalesce(
    jsonb_agg(
      to_jsonb(v) || jsonb_build_object(
        'sub_activity', l.sub_activity,
        'evidence_image_path', l.evidence_image_path,
        'entered_by', l.entered_by,
        'reject_reason', l.reject_reason,
        'submitted_at', l.submitted_at,
        'parent_log_id', l.parent_log_id,
        'supplemental_reason', l.supplemental_reason,
        'reviewed_by', l.reviewed_by
      )
      order by v.work_date, v.id
    ),
    '[]'::jsonb
  )
  from public.get_v_logs_month(p_start, p_end, p_unit_id, p_person_ids) as v
  join public.logs as l on l.id = v.id;
$function$;
