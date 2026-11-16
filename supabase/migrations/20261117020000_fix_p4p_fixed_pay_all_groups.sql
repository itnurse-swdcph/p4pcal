-- Apply the agreed fixed below-guarantee payout and 3% reserve formula
-- consistently across all five P4P groups and all months.

UPDATE public.pay_groups
SET fixed_pay = CASE id
  WHEN 1 THEN 2228.00
  WHEN 2 THEN 1782.00
  WHEN 3 THEN 891.00
  WHEN 4 THEN 446.00
  WHEN 5 THEN 446.00
  ELSE fixed_pay
END
WHERE id BETWEEN 1 AND 5;

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
BEGIN
  a := trunc(g.full_amount, 2);
  -- Keep full precision for the reserve pool; only the displayed per-person
  -- reserve is truncated to two decimals.
  r := a * 3 / 100;
  s := trunc(a - trunc(r, 2), 2);
  fixed_amount := trunc(coalesce(g.fixed_pay, round(s * 0.77, 2)), 2);

  SELECT
    count(*) FILTER (WHERE el),
    count(*) FILTER (WHERE NOT el),
    count(*) FILTER (WHERE el AND cnt < person_guarantee),
    count(*) FILTER (WHERE el AND cnt > person_guarantee),
    coalesce(sum(pool_excess) FILTER (WHERE el), 0)
  INTO n_el, n_in, n_below, n_above, sum_ex
  FROM (
    SELECT
      el,
      person_guarantee,
      cnt,
      least(
        greatest(0, cnt - person_guarantee),
        greatest(0, coalesce(pool_excess_cap, greatest(0, cnt - person_guarantee)))
      ) AS pool_excess
    FROM (
      SELECT
        coalesce((e->>'eligible')::boolean, true) AS el,
        coalesce((e->>'guarantee')::numeric, g.guarantee) AS person_guarantee,
        nullif(e->>'pool_excess_cap', '')::numeric AS pool_excess_cap,
        CASE WHEN coalesce((e->>'eligible')::boolean, true)
          THEN least(
            coalesce((e->>'points')::numeric, 0),
            coalesce((e->>'cap')::numeric, g.guarantee * g.cap_mult)
          )
          ELSE 0
        END AS cnt
      FROM jsonb_array_elements(coalesce(persons, '[]'::jsonb)) e
    ) p0
  ) p;

  -- The shortfall pool uses the rounded 97% base, while reserve contributions
  -- retain full precision until the combined pool is truncated.
  below_difference := trunc((round(a * 0.97, 2) - fixed_amount) * n_below, 2);
  pool_x := trunc(coalesce(carry_extra, 0) + (r * n_el) + below_difference, 2);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'eligible', el,
      'work_days', work_days,
      'eligibility_reason', eligibility_reason,
      'points', pts,
      'counted', cnt,
      'quality_pass', true,
      'quality', 0,
      'activity', aa,
      'extra', xa,
      'total', trunc(aa + xa, 2),
      'ineligible_amount', CASE WHEN NOT el THEN a ELSE 0 END,
      'guarantee', person_guarantee
    ) ORDER BY ord), '[]'::jsonb)
  INTO lines
  FROM (
    SELECT
      id, el, work_days, eligibility_reason, pts, cnt, person_guarantee, ord,
      CASE WHEN el THEN
        CASE WHEN cnt < person_guarantee THEN fixed_amount ELSE s END
      ELSE 0 END AS aa,
      CASE
        WHEN el AND cnt > person_guarantee AND sum_ex > 0 THEN
          trunc(
            least(
              greatest(0, cnt - person_guarantee),
              greatest(0, coalesce(pool_excess_cap, greatest(0, cnt - person_guarantee)))
            ) * pool_x / nullif(sum_ex, 0),
            2
          )
        ELSE 0
      END AS xa
    FROM (
      SELECT
        e->>'id' AS id,
        coalesce((e->>'eligible')::boolean, true) AS el,
        coalesce((e->>'work_days')::numeric, 0) AS work_days,
        coalesce(e->>'eligibility_reason', '') AS eligibility_reason,
        coalesce((e->>'points')::numeric, 0) AS pts,
        coalesce((e->>'guarantee')::numeric, g.guarantee) AS person_guarantee,
        nullif(e->>'pool_excess_cap', '')::numeric AS pool_excess_cap,
        CASE WHEN coalesce((e->>'eligible')::boolean, true)
          THEN least(
            coalesce((e->>'points')::numeric, 0),
            coalesce((e->>'cap')::numeric, g.guarantee * g.cap_mult)
          )
          ELSE 0
        END AS cnt,
        ord
      FROM jsonb_array_elements(coalesce(persons, '[]'::jsonb))
        WITH ORDINALITY t(e, ord)
    ) b
  ) c;

  carry_x_out := trunc(
    pool_x - coalesce((SELECT sum((l->>'extra')::numeric)
                       FROM jsonb_array_elements(lines) l), 0),
    2
  );

  RETURN jsonb_build_object(
    'quality_part', 0,
    'activity_part', s,
    'reserve', trunc(r, 2),
    'by_score', s,
    'fixed', fixed_amount,
    'quality_fail_part', fixed_amount,
    'cap', g.guarantee * g.cap_mult,
    'n_eligible', n_el,
    'n_ineligible', n_in,
    'n_below', n_below,
    'n_above', n_above,
    'below_threshold_difference', below_difference,
    'pool_extra', pool_x,
    'sum_excess', sum_ex,
    'rate_per_point', CASE
      WHEN sum_ex > 0 THEN round(pool_x / sum_ex, 6)
      ELSE 0
    END,
    'carry_extra_out', carry_x_out,
    'pool_quality', 0,
    'quality_share', 0,
    'carry_quality_out', 0,
    'lines', lines
  );
END
$function$;
