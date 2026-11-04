create or replace function public.p4p_alloc(g public.pay_groups, persons jsonb, carry_extra numeric default 0, carry_q numeric default 0)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  q numeric := 0;
  a numeric;
  r numeric;
  s numeric;
  cap numeric;
  n_el int;
  n_in int;
  n_below int;
  sum_ex numeric;
  pool_x numeric;
  carry_x_out numeric;
  below_difference numeric;
  lines jsonb;
begin
  a := g.full_amount;
  r := round(a * 3 / 100, 2);
  s := a - r;
  select count(*) filter (where el),
         count(*) filter (where not el),
         count(*) filter (where el and least(pts, person_cap) < person_guarantee),
         coalesce(sum(greatest(0, least(pts, person_cap) - person_guarantee)) filter (where el), 0)
    into n_el, n_in, n_below, sum_ex
  from (
    select coalesce((e->>'eligible')::boolean, true) el,
           coalesce((e->>'points')::numeric, 0) pts,
           coalesce((e->>'guarantee')::numeric, g.guarantee) person_guarantee,
           coalesce((e->>'cap')::numeric, g.guarantee * g.cap_mult) person_cap
    from jsonb_array_elements(persons) e
  ) p;

  below_difference := (s - round(g.full_amount * 0.77, 2)) * n_below;
  pool_x := coalesce(carry_extra, 0) + round(r * n_el, 2)
    + below_difference + g.full_amount * n_in;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'eligible', el, 'work_days', work_days,
      'eligibility_reason', eligibility_reason,
      'points', pts, 'counted', cnt,
      'quality_pass', true, 'quality', 0, 'activity', aa, 'extra', xa,
      'total', aa + xa
    ) order by ord), '[]'::jsonb)
  into lines
  from (
    select id, el, work_days, eligibility_reason, pts, cnt, ord,
      case when el then
        case when cnt < person_guarantee then round(g.full_amount * 0.77, 2) else s end
      else 0 end aa,
      case when el and sum_ex > 0 then
        trunc(greatest(0, cnt - person_guarantee) * pool_x / sum_ex, 2)
      else 0 end xa
    from (
      select e->>'id' id,
        coalesce((e->>'eligible')::boolean, true) el,
        coalesce((e->>'work_days')::numeric, 0) work_days,
        coalesce(e->>'eligibility_reason','') eligibility_reason,
        coalesce((e->>'points')::numeric, 0) pts,
        coalesce((e->>'guarantee')::numeric, g.guarantee) person_guarantee,
        case when coalesce((e->>'eligible')::boolean, true)
          then least(coalesce((e->>'points')::numeric, 0),
            coalesce((e->>'cap')::numeric, g.guarantee * g.cap_mult))
          else 0 end cnt,
        ord
      from jsonb_array_elements(persons) with ordinality t(e, ord)
    ) b
  ) c;

  carry_x_out := pool_x - coalesce((select sum((l->>'extra')::numeric) from jsonb_array_elements(lines) l), 0);
  return jsonb_build_object(
    'quality_part', 0, 'activity_part', s, 'reserve', r, 'by_score', s,
    'fixed', round(g.full_amount * 0.77, 2), 'quality_fail_part', round(g.full_amount * 0.77, 2),
    'cap', g.guarantee * g.cap_mult,
    'n_eligible', n_el, 'n_ineligible', n_in, 'n_below', n_below,
    'below_threshold_difference', round(below_difference,2),
    'pool_extra', pool_x, 'sum_excess', sum_ex,
    'rate_per_point', case when sum_ex > 0 then round(pool_x / sum_ex, 6) else 0 end,
    'carry_extra_out', carry_x_out, 'pool_quality', 0, 'quality_share', 0,
    'carry_quality_out', 0, 'lines', lines
  );
end
$function$;