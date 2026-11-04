-- Admin offboarding: retain historical P4P logs while disabling the account/personnel record.
create or replace function public.admin_offboard_staff(p_source_row integer)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_person_id uuid;
  v_name text;
begin
  if auth.uid() is null or public.my_role() <> 'admin' then
    raise exception 'สิทธิ์ไม่เพียงพอ';
  end if;
  select concat_ws(' ',sd.prefix,sd.first_name,sd.last_name), pr.user_id, pe.id
    into v_name,v_user_id,v_person_id
  from public.staff_directory sd
  left join public.profiles pr on pr.staff_directory_id=sd.source_row
  left join public.people pe on pe.staff_directory_id=sd.source_row
  where sd.source_row=p_source_row
  for update of sd;
  if not found then raise exception 'ไม่พบบุคลากรในทะเบียน'; end if;
  if exists(select 1 from public.staff_directory where source_row=p_source_row and org_role in ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล')) then
    raise exception 'ไม่อนุญาตให้ลบบัญชีผู้บริหารระดับหัวหน้าพยาบาลผ่านเมนูนี้';
  end if;
  update public.staff_directory set active=false where source_row=p_source_row;
  update public.people set active=false, user_id=null where staff_directory_id=p_source_row;
  update public.profiles set role='disabled' where staff_directory_id=p_source_row;
  return jsonb_build_object('success',true,'staff_name',v_name,'user_disabled',v_user_id is not null,'person_deactivated',v_person_id is not null,'history_preserved',true);
end;
$$;
revoke all on function public.admin_offboard_staff(integer) from public, anon;
grant execute on function public.admin_offboard_staff(integer) to authenticated;
