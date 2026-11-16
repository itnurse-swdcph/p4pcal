-- October 2569: remove the 3% reserve for every pay group and expose
-- the immutable closed-snapshot score to the personal activity summary.
do $do$
declare
  fn text;
  old_expr text := $old$  r := trunc(a * 3 / 100, 2);$old$;
  new_expr text := $new$  r := case when p_month = DATE '2026-10-01' then 0 else trunc(a * 3 / 100, 2) end;$new$;
begin
  select pg_get_functiondef('public.p4p_alloc(public.pay_groups,jsonb,numeric,numeric,date)'::regprocedure)
    into fn;
  if position($needle$p_month = DATE '2026-10-01' then 0$needle$ in fn) = 0 then
    if position(old_expr in fn) = 0 then
      raise exception 'Could not locate p4p_alloc reserve expression';
    end if;
    execute replace(fn, old_expr, new_expr);
  end if;
end
$do$;

do $do$
declare
  fn text;
  old_expr text := $old$    'pay_group',line_data->'pay_group',$old$;
  new_expr text := $new$    'pay_group',line_data->'pay_group',
    'points',coalesce(line_data->'points','0'::jsonb),
    'counted',coalesce(line_data->'counted','0'::jsonb),
    'guarantee',coalesce(line_data->'guarantee','0'::jsonb),
    'eligible',coalesce(line_data->'eligible','false'::jsonb),
    'eligibility_reason',coalesce(line_data->'eligibility_reason','null'::jsonb),$new$;
begin
  select pg_get_functiondef('public.p4p_my_payout(date)'::regprocedure)
    into fn;
  if position($needle$'counted',coalesce(line_data->'counted'$needle$ in fn) = 0 then
    if position(old_expr in fn) = 0 then
      raise exception 'Could not locate p4p_my_payout return expression';
    end if;
    execute replace(fn, old_expr, new_expr);
  end if;
end
$do$;
