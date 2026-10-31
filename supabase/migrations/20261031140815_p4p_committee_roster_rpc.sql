-- Provide the committee roster with display names to committee members and administrators.
create or replace function public.p4p_committee_roster()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not (
    public.my_role()='admin' or
    (public.my_role()='committee' and public.p4p_is_committee_member())
  ) then
    raise exception 'ไม่มีสิทธิ์ดูทะเบียนคณะกรรมการ P4P';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,
      'full_name',p.full_name,
      'username',p.username,
      'active',m.active,
      'is_chair',m.is_chair,
      'appointed_at',m.appointed_at
    ) order by m.is_chair desc,p.full_name)
    from public.p4p_committee_members m
    join public.profiles p on p.user_id=m.user_id
    where p.role='committee'
  ),'[]'::jsonb);
end;
$$;

alter function public.p4p_alloc(public.pay_groups,jsonb,numeric,numeric) set search_path=public;
revoke execute on function public.p4p_committee_roster() from public,anon;
grant execute on function public.p4p_committee_roster() to authenticated;
