-- Return a complete month/unit activity result as one JSONB value.
-- This avoids repeating the full window-function calculation for each 1,000-row PostgREST page
-- and folds supplemental log fields into the same request.
CREATE OR REPLACE FUNCTION public.get_v_logs_month_json(
  p_start date,
  p_end date,
  p_unit_id bigint DEFAULT NULL,
  p_person_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(v) || jsonb_build_object(
        'sub_activity', l.sub_activity,
        'evidence_image_path', l.evidence_image_path,
        'entered_by', l.entered_by,
        'reject_reason', l.reject_reason,
        'submitted_at', l.submitted_at,
        'parent_log_id', l.parent_log_id,
        'supplemental_reason', l.supplemental_reason
      )
      ORDER BY v.work_date, v.id
    ),
    '[]'::jsonb
  )
  FROM public.get_v_logs_month(p_start, p_end, p_unit_id, p_person_ids) AS v
  JOIN public.logs AS l ON l.id = v.id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_v_logs_month_json(date, date, bigint, uuid[]) TO authenticated;
