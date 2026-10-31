create or replace function public.p4p_committee_roster()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      'full_name',coalesce(nullif(trim(p.full_name),''), nullif(trim(concat_ws(' ',sd.prefix,sd.first_name,sd.last_name)),'')),
      'position',coalesce(nullif(trim(p.position),''),sd.position),
      'active',m.active,
      'is_chair',m.is_chair,
      'appointed_at',m.appointed_at
    ) order by m.is_chair desc,coalesce(nullif(trim(p.full_name),''), concat_ws(' ',sd.prefix,sd.first_name,sd.last_name)))
    from public.p4p_committee_members m
    join public.profiles p on p.user_id=m.user_id
    left join public.staff_directory sd on sd.source_row=p.staff_directory_id
    where p.role='committee'
  ),'[]'::jsonb);
end;
$function$;
