create or replace function public.p4p_committee_pending_count(p_month date)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare n integer;
begin
  if auth.uid() is null or not (public.my_role()='admin' or (public.my_role()='committee' and public.p4p_is_committee_member())) then
    raise exception 'ไม่มีสิทธิ์ตรวจสอบรายการค้าง P4P';
  end if;
  select count(*) into n from public.v_logs
  where month=date_trunc('month',p_month)::date and status='pending';
  return n;
end;
$$;
revoke execute on function public.p4p_committee_pending_count(date) from public,anon;
grant execute on function public.p4p_committee_pending_count(date) to authenticated;
