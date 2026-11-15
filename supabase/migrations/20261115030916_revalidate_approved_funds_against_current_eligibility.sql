do $$
declare v text; old text; new text;
begin
 v:=pg_get_functiondef('public.p4p_calc(date)'::regprocedure);
 old:=$old$
      coalesce((select sum(q.approved_amount) from public.p4p_ineligible_fund_requests q
        where q.month=m and q.unit_id=(t.v->>'unit_id')::integer and q.status='approved'),0)::numeric as approved_total,
  $old$;
 new:=$new$
      coalesce((
        select sum(least(r.approved_total,r.available_amount))
        from (
          select q.staff_directory_id, sum(q.approved_amount)::numeric as approved_total,
            max(coalesce((source.v->>'ineligible_amount')::numeric,0))::numeric as available_amount
          from public.p4p_ineligible_fund_requests q
          join jsonb_array_elements(lines) as source(v)
            on (source.v->>'staff_directory_id')::integer=q.staff_directory_id
           and (source.v->>'unit_id')::integer=q.unit_id
           and coalesce((source.v->>'eligible')::boolean,false)=false
          where q.month=m and q.unit_id=(t.v->>'unit_id')::integer and q.status='approved'
          group by q.staff_directory_id
        ) r
      ),0)::numeric as approved_total,
  $new$;
 if position(old in v)=0 then raise exception 'approved fund source validation anchor missing'; end if;
 v:=replace(v,old,new);
 execute v;
end $$;