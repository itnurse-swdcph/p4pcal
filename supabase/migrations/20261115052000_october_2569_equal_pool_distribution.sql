do $$
declare
  v_alloc text;
  v_calc text;
  old_text text;
  new_text text;
begin
  v_alloc := pg_get_functiondef('public.p4p_alloc(pay_groups,jsonb,numeric,numeric,date)'::regprocedure);

  old_text := $old$r := case when p_month = DATE '2026-10-01' then 0 else trunc(a * 3 / 100, 2) end;$old$;
  new_text := $new$r := trunc(a * 3 / 100, 2);$new$;
  if position(old_text in v_alloc)=0 then raise exception 'October reserve rule anchor not found in p4p_alloc'; end if;
  v_alloc := replace(v_alloc, old_text, new_text);

  old_text := $old$
        WHEN el AND cnt > person_guarantee AND sum_ex > 0
          THEN trunc(greatest(0, cnt - person_guarantee) * pool_x / sum_ex, 2)
        ELSE 0
$old$;
  new_text := $new$
        WHEN el AND cnt > person_guarantee AND sum_ex > 0 THEN
          CASE WHEN p_month = DATE '2026-10-01'
            THEN trunc(pool_x / nullif(n_above, 0), 2)
            ELSE trunc(greatest(0, cnt - person_guarantee) * pool_x / sum_ex, 2)
          END
        ELSE 0
$new$;
  if position(old_text in v_alloc)=0 then raise exception 'Equal central-pool share anchor not found in p4p_alloc'; end if;
  v_alloc := replace(v_alloc, old_text, new_text);
  execute v_alloc;

  v_calc := pg_get_functiondef('public.p4p_calc(date)'::regprocedure);

  old_text := $old$
      coalesce((select sum(greatest(0,coalesce((z->>'counted')::numeric,0)-coalesce((z->>'guarantee')::numeric,0)))
        from jsonb_array_elements(lines) z
        where coalesce((z->>'eligible')::boolean,false)
          and (z->>'unit_id')::integer=(t.v->>'unit_id')::integer
          and z->>'pay_group'=t.v->>'pay_group'),0)::numeric as unit_excess
$old$;
  new_text := $new$
      coalesce((select count(*)::numeric
        from jsonb_array_elements(lines) z
        where coalesce((z->>'eligible')::boolean,false)
          and greatest(0,coalesce((z->>'counted')::numeric,0)-coalesce((z->>'guarantee')::numeric,0)) > 0
          and (z->>'unit_id')::integer=(t.v->>'unit_id')::integer
          and z->>'pay_group'=t.v->>'pay_group'),0)::numeric as unit_excess
$new$;
  if position(old_text in v_calc)=0 then raise exception 'Equal ineligible-fund recipient-count anchor not found in p4p_calc'; end if;
  v_calc := replace(v_calc, old_text, new_text);

  old_text := $old$
    select *, case when eligible and own_excess>0 and unit_excess>0 and approved_total>0
      then trunc(own_excess*approved_total/unit_excess,2) else 0 end as fund_share
    from base
$old$;
  new_text := $new$
    select *, case when eligible and own_excess>0 and unit_excess>0 and approved_total>0
      then case when m = DATE '2026-10-01'
        then trunc(approved_total/unit_excess,2)
        else trunc(own_excess*approved_total/unit_excess,2)
      end
      else 0 end as fund_share
    from base
$new$;
  if position(old_text in v_calc)=0 then raise exception 'October equal ineligible-fund share anchor not found in p4p_calc'; end if;
  v_calc := replace(v_calc, old_text, new_text);
  execute v_calc;
end $$;