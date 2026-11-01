-- Read-only helper: lets any signed-in user know whether the P4P committee has closed a month
-- (used for the "not yet closed" watermark on the unit report). Returns only a boolean.
create or replace function public.p4p_month_is_closed(p_month date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.p4p_closed_months
    where month = date_trunc('month', p_month)::date
      and result is not null
  );
$$;

revoke all on function public.p4p_month_is_closed(date) from public, anon;
grant execute on function public.p4p_month_is_closed(date) to authenticated;
