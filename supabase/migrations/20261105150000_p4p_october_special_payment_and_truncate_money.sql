CREATE OR REPLACE FUNCTION public.p4p_alloc(
  g public.pay_groups,
  persons jsonb,
  carry_extra numeric DEFAULT 0,
  carry_q numeric DEFAULT 0,
  p_month date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  a numeric;
  r numeric;
  s numeric;
  n_el int;
  n_in int;
  n_below int;
  n_above int;
  sum_ex numeric;
  pool_x numeric;
  carry_x_out numeric;
  below_difference numeric;
  fixed_amount numeric;
  lines jsonb;
  is_october boolean := (p_month = DATE '2026-10-01');
BEGIN
  a := trunc(g.full_amount, 2);
  IF is_october THEN
    r := 0;
    s := a;
  ELSE
    r := trunc(a * 3 / 100, 2);
    s := trunc(a - r, 2);
  END IF;
  fixed_amount := trunc(a * 0.77, 2);

  SELECT
    count(*) FILTER (WHERE el),
    count(*) FILTER (WHERE NOT el),
    count(*) FILTER (WHERE el AND cnt < person_guarantee),
    count(*) FILTER (WHERE el AND cnt > person_guarantee),
    coalesce(sum(greatest(0, cnt - person_guarantee)) FILTER (WHERE el), 0)
  INTO n_el, n_in, n_below, n_above, sum_ex
  FROM (
    SELECT
      coalesce((e->>'eligible')::boolean, true) AS el,
      coalesce((e->>'guarantee')::numeric, g.guarantee) AS person_guarantee,
      CASE WHEN coalesce((e->>'eligible')::boolean, true)
        THEN least(coalesce((e->>'points')::numeric, 0),
                   coalesce((e->>'cap')::numeric, g.guarantee * g.cap_mult))
        ELSE 0 END AS cnt
    FROM jsonb_array_elements(coalesce(persons, '[]'::jsonb)) e
  ) p;

  below_difference := trunc(((CASE WHEN is_october THEN a ELSE s END) - fixed_amount) * n_below, 2);

  IF is_october THEN
    pool_x := trunc((a * n_in) + ((a - fixed_amount) * n_below), 2);
  ELSE
    pool_x := trunc(coalesce(carry_extra, 0) + (r * n_el)
                    + below_difference + (a * n_in), 2);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'eligible', el, 'work_days', work_days,
      'eligibility_reason', eligibility_reason, 'points', pts, 'counted', cnt,
      'quality_pass', true, 'quality', 0, 'activity', aa, 'extra', xa,
      'total', trunc(aa + xa, 2)
    ) ORDER BY ord), '[]'::jsonb)
  INTO lines
  FROM (
    SELECT id, el, work_days, eligibility_reason, pts, cnt, ord,
      CASE WHEN el THEN
        CASE WHEN cnt < person_guarantee THEN fixed_amount ELSE s END
      ELSE 0 END AS aa,
      CASE
        WHEN is_october AND el AND cnt > person_guarantee AND n_above > 0
          THEN trunc(pool_x / n_above, 2)
        WHEN NOT is_october AND el AND sum_ex > 0
          THEN trunc(greatest(0, cnt - person_guarantee) * pool_x / sum_ex, 2)
        ELSE 0
      END AS xa
    FROM (
      SELECT e->>'id' AS id,
        coalesce((e->>'eligible')::boolean, true) AS el,
        coalesce((e->>'work_days')::numeric, 0) AS work_days,
        coalesce(e->>'eligibility_reason', '') AS eligibility_reason,
        coalesce((e->>'points')::numeric, 0) AS pts,
        coalesce((e->>'guarantee')::numeric, g.guarantee) AS person_guarantee,
        CASE WHEN coalesce((e->>'eligible')::boolean, true)
          THEN least(coalesce((e->>'points')::numeric, 0),
                     coalesce((e->>'cap')::numeric, g.guarantee * g.cap_mult))
          ELSE 0 END AS cnt,
        ord
      FROM jsonb_array_elements(coalesce(persons, '[]'::jsonb))
        WITH ORDINALITY t(e, ord)
    ) b
  ) c;

  carry_x_out := trunc(pool_x - coalesce(
    (SELECT sum((l->>'extra')::numeric) FROM jsonb_array_elements(lines) l), 0
  ), 2);

  RETURN jsonb_build_object(
    'quality_part', 0, 'activity_part', s, 'reserve', r, 'by_score', s,
    'fixed', fixed_amount, 'quality_fail_part', fixed_amount,
    'cap', g.guarantee * g.cap_mult,
    'n_eligible', n_el, 'n_ineligible', n_in, 'n_below', n_below,
    'n_above', n_above, 'below_threshold_difference', below_difference,
    'pool_extra', pool_x, 'sum_excess', sum_ex,
    'rate_per_point', CASE WHEN NOT is_october AND sum_ex > 0
      THEN round(pool_x / sum_ex, 6) ELSE 0 END,
    'carry_extra_out', carry_x_out, 'pool_quality', 0,
    'quality_share', 0, 'carry_quality_out', 0, 'lines', lines
  );
END
$function$;

DO $migration$
DECLARE
  v_def text;
  v_old_call text := 'res := public.p4p_alloc(g, persons, cx, 0);';
BEGIN
  SELECT pg_get_functiondef('public.p4p_calc(date)'::regprocedure) INTO v_def;
  IF position(v_old_call IN v_def) = 0 THEN
    RAISE EXCEPTION 'ไม่พบจุดเรียก p4p_alloc เดิมใน p4p_calc; ยกเลิก migration';
  END IF;
  v_def := replace(v_def, v_old_call,
    'res := public.p4p_alloc(g, persons, cx, 0, m);');
  EXECUTE v_def;
END
$migration$;

DROP FUNCTION public.p4p_alloc(public.pay_groups, jsonb, numeric, numeric);
