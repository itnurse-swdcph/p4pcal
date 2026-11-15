do $$
declare
  v text;
  old_source text;
  new_source text;
  old_recipients text;
  new_recipients text;
begin
  v := pg_get_functiondef('public.p4p_calc(date)'::regprocedure);
  old_source := $old$
           and (source.v->>'unit_id')::integer=q.unit_id
           and coalesce((source.v->>'eligible')::boolean,false)=false
          where q.month=m and q.unit_id=(t.v->>'unit_id')::integer and q.status='approved'
$old$;
  new_source := $new$
           and (source.v->>'unit_id')::integer=q.unit_id
           and source.v->>'pay_group'=t.v->>'pay_group'
           and coalesce((source.v->>'eligible')::boolean,false)=false
          where q.month=m and q.unit_id=(t.v->>'unit_id')::integer and q.status='approved'
$new$;
  old_recipients := $old$
        where coalesce((z->>'eligible')::boolean,false)
          and (z->>'unit_id')::integer=(t.v->>'unit_id')::integer),0)::numeric as unit_excess
$old$;
  new_recipients := $new$
        where coalesce((z->>'eligible')::boolean,false)
          and (z->>'unit_id')::integer=(t.v->>'unit_id')::integer
          and z->>'pay_group'=t.v->>'pay_group'),0)::numeric as unit_excess
$new$;
  if position(old_source in v)=0 then raise exception 'Could not find approved-fund source grouping anchor'; end if;
  if position(old_recipients in v)=0 then raise exception 'Could not find recipient excess grouping anchor'; end if;
  v := replace(v, old_source, new_source);
  v := replace(v, old_recipients, new_recipients);
  execute v;
end $$;
