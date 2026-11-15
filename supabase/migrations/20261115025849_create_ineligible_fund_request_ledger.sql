create table if not exists public.p4p_ineligible_fund_requests (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  staff_directory_id integer not null,
  unit_id integer not null references public.units(id),
  requested_amount numeric(12,2) not null check (requested_amount > 0),
  approved_amount numeric(12,2),
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  request_by uuid not null references auth.users(id),
  request_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_comment text,
  constraint p4p_ineligible_fund_month_first check (extract(day from month) = 1),
  constraint p4p_ineligible_fund_approved_nonnegative check (approved_amount is null or approved_amount >= 0)
);
create index if not exists p4p_ineligible_fund_requests_month_unit_idx on public.p4p_ineligible_fund_requests(month, unit_id, status);
create index if not exists p4p_ineligible_fund_requests_staff_idx on public.p4p_ineligible_fund_requests(month, staff_directory_id);
alter table public.p4p_ineligible_fund_requests enable row level security;
revoke all on public.p4p_ineligible_fund_requests from anon, authenticated;
grant select, insert, update, delete on public.p4p_ineligible_fund_requests to service_role;

do $$
declare v text; old text; new text;
begin
  v := pg_get_functiondef('public.p4p_alloc(public.pay_groups,jsonb,numeric,numeric,date)'::regprocedure);
  old := '+ below_difference' || E'\n    + (a * n_in),';
  new := '+ below_difference,';
  if position(old in v) = 0 then raise exception 'p4p_alloc pool formula anchor not found'; end if;
  v := replace(v, old, new);
  old := 'id, el, work_days, eligibility_reason, pts, cnt, ord,';
  new := 'id, el, work_days, eligibility_reason, pts, cnt, person_guarantee, ord,';
  if position(old in v) = 0 then raise exception 'p4p_alloc person guarantee anchor not found'; end if;
  v := replace(v, old, new);
  old := '''total'', trunc(aa + xa, 2)';
  new := '''total'', trunc(aa + xa, 2), ''ineligible_amount'', case when not el then a else 0 end, ''guarantee'', person_guarantee';
  if position(old in v) = 0 then raise exception 'p4p_alloc output anchor not found'; end if;
  v := replace(v, old, new);
  execute v;
end $$;