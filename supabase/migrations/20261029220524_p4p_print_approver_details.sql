create or replace function public.approver_print_details_of(p_person uuid)
returns table(
  approver_name text,
  approver_position text,
  approver_professional_position text,
  approver_org_role text,
  approver_unit_name text,
  approver_nursing_group text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  subject public.people;
  caller_role text := coalesce(public.my_role(), '');
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนดูข้อมูลผู้รับรอง';
  end if;

  select * into subject from public.people p where p.id = p_person;
  if subject.id is null then return; end if;
  if not (
    subject.user_id = auth.uid()
    or caller_role in ('admin', 'committee')
    or public.can_write_person(subject.id)
    or public.can_approve_person(subject.id)
  ) then
    raise exception 'ไม่มีสิทธิ์ดูข้อมูลบุคลากรนี้';
  end if;

  return query
  with scope as (
    select p.unit_id, public.person_level(p.id) as level,
           coalesce(sd.nursing_group, u.parent_group, u.name) as group_name
    from public.people p
    left join public.staff_directory sd on sd.source_row = p.staff_directory_id
    left join public.units u on u.id = p.unit_id
    where p.id = p_person
  ), candidates as (
    select
      coalesce(nullif(trim(sd.prefix || sd.first_name || ' ' || sd.last_name), ''), h.full_name) as signer_name,
      public.approval_level(h.user_id) as signer_level,
      (h.unit_id = scope.unit_id) as same_unit,
      case when public.approval_level(h.user_id) = 3 then 'หัวหน้าพยาบาล/รักษาการหัวหน้าพยาบาล'
           when public.approval_level(h.user_id) = 2 then 'หัวหน้ากลุ่มงาน'
           else 'หัวหน้างาน' end as approval_role,
      coalesce(nullif(trim(sd.position), ''), h.position) as professional_position,
      coalesce(nullif(trim(sd.org_role), ''), h.org_role) as managerial_role,
      sd.unit_name,
      sd.nursing_group
    from scope
    join public.profiles h on h.role in ('head', 'group_head', 'admin')
    left join public.staff_directory sd on sd.source_row = h.staff_directory_id
    left join public.profile_units pu on pu.user_id = h.user_id and pu.unit_id = scope.unit_id and pu.approved
    left join public.units hu on hu.id = h.unit_id
    where public.approval_level(h.user_id) > scope.level
      and (
        h.unit_id = scope.unit_id
        or pu.unit_id is not null
        or public.approval_level(h.user_id) = 3
        or (public.approval_level(h.user_id) = 2 and coalesce(h.nursing_group, hu.parent_group, hu.name) = scope.group_name)
      )
      and (
        public.approval_level(h.user_id) = scope.level + 1
        or not exists (
          select 1
          from public.profiles mid
          left join public.profile_units mp on mp.user_id = mid.user_id and mp.unit_id = scope.unit_id and mp.approved
          left join public.units mu on mu.id = mid.unit_id
          where mid.role in ('head', 'group_head', 'admin')
            and public.approval_level(mid.user_id) = scope.level + 1
            and (
              mid.unit_id = scope.unit_id
              or mp.unit_id is not null
              or public.approval_level(mid.user_id) = 3
              or (public.approval_level(mid.user_id) = 2 and coalesce(mid.nursing_group, mu.parent_group, mu.name) = scope.group_name)
            )
        )
      )
  )
  select signer_name, approval_role, professional_position, managerial_role, unit_name, nursing_group
  from candidates
  order by signer_level, same_unit desc, signer_name
  limit 1;
end
$function$;

revoke execute on function public.approver_print_details_of(uuid) from public, anon;
grant execute on function public.approver_print_details_of(uuid) to authenticated;
