do $$
declare
  fn text;
  old_expr text := '  r := trunc(a * 3 / 100, 2);';
  new_expr text := '  r := case when p_month = DATE ''2026-10-01'' then 0 else trunc(a * 3 / 100, 2) end;';
begin
  select pg_get_functiondef('public.p4p_alloc(public.pay_groups,jsonb,numeric,numeric,date)'::regprocedure) into fn;
  if position(old_expr in fn) = 0 then
    raise exception 'Expected p4p_alloc reserve expression not found; function was not changed';
  end if;
  fn := replace(fn, old_expr, new_expr);
  execute fn;
end $$;