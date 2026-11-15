revoke all on function public.p4p_fund_requests_list(date) from public, anon;
revoke all on function public.p4p_fund_request_create(date,integer,integer,numeric,text) from public, anon;
revoke all on function public.p4p_fund_request_decide(uuid,text,numeric,text) from public, anon;
grant execute on function public.p4p_fund_requests_list(date) to authenticated;
grant execute on function public.p4p_fund_request_create(date,integer,integer,numeric,text) to authenticated;
grant execute on function public.p4p_fund_request_decide(uuid,text,numeric,text) to authenticated;