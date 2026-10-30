-- P4P single-stage approval, resolved from staff_directory.
-- Priority: unit head, then matching nursing group head, then acting chief nurse.
create or replace function public.assigned_approver_for_person(p_person uuid)
returns table (
  approver_staff_directory_id integer, approver_name text, approver_position text,
  approver_org_role text, approver_user_id uuid, approver_stage text
)
language sql stable security definer set search_path=public
as $$
  with subject as (
    select p.id,p.staff_directory_id,p.unit_id,sd.unit_name as sd_unit_name,
      sd.nursing_group as sd_group,sd.extra_nursing_group_names as sd_extra_groups,
      coalesce(nullif(trim(sd.unit_name),''),nullif(trim(u.name),'')) as unit_name,
      coalesce(nullif(trim(sd.nursing_group),''),nullif(trim(u.parent_group),'')) as group_name,
      u.parent_group
    from public.people p
    left join public.staff_directory sd on sd.source_row=p.staff_directory_id
    left join public.units u on u.id=p.unit_id where p.id=p_person
  ),
  unit_heads as (
    select h.source_row,concat_ws('',h.prefix,h.first_name,' ',h.last_name) full_name,
      h.position,h.org_role,pr.user_id,1 priority,'หัวหน้างาน'::text stage
    from subject s join public.staff_directory h on h.active
      and replace(trim(coalesce(h.org_role,'')),' ','')='หัวหน้างาน'
    left join public.profiles pr on pr.staff_directory_id=h.source_row
    where s.unit_name is not null and exists (
      select 1 from regexp_split_to_table(concat_ws('|',nullif(h.unit_name,''),nullif(h.extra_unit_names,'')),'[,;|]') x(unit_name)
      where trim(x.unit_name)=s.unit_name
    )
  ),
  group_heads as (
    select h.source_row,concat_ws('',h.prefix,h.first_name,' ',h.last_name) full_name,
      h.position,h.org_role,pr.user_id,2 priority,'หัวหน้ากลุ่มงาน'::text stage
    from subject s join public.staff_directory h on h.active and h.source_row<>2
      and replace(trim(coalesce(h.org_role,'')),' ','')='หัวหน้ากลุ่มงาน'
    left join public.profiles pr on pr.staff_directory_id=h.source_row
    where exists (
      select 1 from regexp_split_to_table(concat_ws('|',nullif(s.sd_group,''),nullif(s.sd_extra_groups,''),nullif(s.parent_group,'')),'[,;|]') sg(group_name)
      join regexp_split_to_table(concat_ws('|',nullif(h.nursing_group,''),nullif(h.extra_nursing_group_names,'')),'[,;|]') hg(group_name)
        on trim(hg.group_name)=trim(sg.group_name)
      where trim(sg.group_name)<>''
    )
  ),
  candidates as (
    select * from unit_heads
    union all select * from group_heads
    union all
    select h.source_row,concat_ws('',h.prefix,h.first_name,' ',h.last_name),h.position,h.org_role,
      pr.user_id,3,'รักษาการหัวหน้าพยาบาล'
    from public.staff_directory h left join public.profiles pr on pr.staff_directory_id=h.source_row
    where h.active and h.source_row=2
      and not exists(select 1 from unit_heads) and not exists(select 1 from group_heads)
  )
  select c.source_row,c.full_name,c.position,c.org_role,c.user_id,c.stage
  from candidates c order by c.priority,c.source_row limit 1;
$$;

create or replace function public.person_approvers()
returns table (
  person_id uuid, approver_staff_directory_id integer, approver_name text,
  approver_position text, approver_org_role text, approver_user_id uuid, approver_stage text
)
language sql stable security definer set search_path=public
as $$
  select p.id,a.approver_staff_directory_id,a.approver_name,a.approver_position,
    a.approver_org_role,a.approver_user_id,a.approver_stage
  from public.people p cross join lateral public.assigned_approver_for_person(p.id) a
  where p.active;
$$;

create or replace function public.approver_of(p_person uuid)
returns table(approver_name text,approver_position text)
language sql stable security definer set search_path=public
as $$
  select a.approver_name,a.approver_position from public.assigned_approver_for_person(p_person) a;
$$;

create or replace function public.can_approve_person(pid uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.assigned_approver_for_person(pid) a
    join public.profiles me on me.user_id=auth.uid()
    where a.approver_user_id=auth.uid()
      and me.staff_directory_id=a.approver_staff_directory_id
      and not exists(select 1 from public.people p where p.id=pid and p.user_id=auth.uid())
  );
$$;

revoke all on function public.assigned_approver_for_person(uuid) from public,anon;
revoke all on function public.person_approvers() from public,anon;
revoke all on function public.approver_of(uuid) from public,anon;
revoke all on function public.can_approve_person(uuid) from public,anon;
grant execute on function public.assigned_approver_for_person(uuid) to authenticated;
grant execute on function public.person_approvers() to authenticated;
grant execute on function public.approver_of(uuid) to authenticated;
grant execute on function public.can_approve_person(uuid) to authenticated;
