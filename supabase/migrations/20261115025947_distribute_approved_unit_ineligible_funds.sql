do $$
declare v text; old text; new text;
begin
 v:=pg_get_functiondef('public.p4p_calc(date)'::regprocedure);
 old:='  select coalesce(sum(pending_count), 0)::integer into pend from pg_temp.p4p_calc_month_activity;';
 new:=$ins$
  -- Approved ineligible funds are redistributed only within their originating unit.
  with base as (
    select t.v, t.ord,
      coalesce((t.v->>'eligible')::boolean,false) as eligible,
      greatest(0,coalesce((t.v->>'counted')::numeric,0)-coalesce((t.v->>'guarantee')::numeric,0)) as own_excess,
      coalesce((select sum(q.approved_amount) from public.p4p_ineligible_fund_requests q
        where q.month=m and q.unit_id=(t.v->>'unit_id')::integer and q.status='approved'),0)::numeric as approved_total,
      coalesce((select sum(greatest(0,coalesce((z->>'counted')::numeric,0)-coalesce((z->>'guarantee')::numeric,0)))
        from jsonb_array_elements(lines) z
        where coalesce((z->>'eligible')::boolean,false)
          and (z->>'unit_id')::integer=(t.v->>'unit_id')::integer),0)::numeric as unit_excess
    from jsonb_array_elements(lines) with ordinality as t(v,ord)
  ), shares as (
    select *, case when eligible and own_excess>0 and unit_excess>0 and approved_total>0
      then trunc(own_excess*approved_total/unit_excess,2) else 0 end as fund_share
    from base
  )
  select coalesce(jsonb_agg(v || jsonb_build_object(
    'unit_fund_extra', fund_share,
    'extra', trunc(coalesce((v->>'extra')::numeric,0)+fund_share,2),
    'total', trunc(coalesce((v->>'total')::numeric,0)+fund_share,2)
  ) order by ord), '[]'::jsonb)
  into lines
  from shares;

  select coalesce(sum(pending_count), 0)::integer into pend from pg_temp.p4p_calc_month_activity;
  $ins$;
 if position(old in v)=0 then raise exception 'fund insertion anchor missing'; end if;
 v:=replace(v,old,new);
 execute v;
end $$;