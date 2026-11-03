CREATE OR REPLACE FUNCTION public.assigned_approver_for_person(p_person uuid)
 RETURNS TABLE(approver_staff_directory_id integer, approver_name text, approver_position text, approver_org_role text, approver_user_id uuid, approver_stage text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with subject as (
 select p.id,p.staff_directory_id,p.unit_id,sd.org_role submitter_org_role,
 sd.unit_name submitter_unit,sd.extra_unit_names submitter_extra_units,
 sd.nursing_group submitter_group,sd.extra_nursing_group_names submitter_extra_groups,
 coalesce(nullif(trim(sd.unit_name),''),nullif(trim(u.name),'')) unit_name,
 coalesce(nullif(trim(sd.nursing_group),''),nullif(trim(u.parent_group),'')) group_name,u.parent_group
 from public.people p
 left join public.staff_directory sd on sd.source_row=p.staff_directory_id
 left join public.units u on u.id=p.unit_id where p.id=p_person
),
unit_heads as (
 select h.source_row,concat_ws('',h.prefix,h.first_name,' ',h.last_name) full_name,
 h.position,h.org_role,pr.user_id,1 priority,'หัวหน้างาน'::text stage
 from subject s
 join public.staff_directory h on h.active and (
   replace(trim(coalesce(h.org_role,'')),' ','')='หัวหน้างาน'
   or h.source_row in (6,21,148,165)
 )
 left join public.profiles pr on pr.staff_directory_id=h.source_row
 where (
   exists (
     select 1 from regexp_split_to_table(concat_ws('|',nullif(h.unit_name,''),nullif(h.extra_unit_names,'')),'[,;|]') x(unit_name)
     where trim(x.unit_name)=s.unit_name
   )
   or (
     h.source_row in (6,21,148,165)
     and exists (
       select 1 from public.profiles hp
       where hp.staff_directory_id=h.source_row
         and (hp.unit_id=s.unit_id or exists (
           select 1 from public.profile_units hpu
           where hpu.user_id=hp.user_id and hpu.approved and hpu.unit_id=s.unit_id
         ))
     )
   )
 )
),
group_heads as (
 select h.source_row,concat_ws('',h.prefix,h.first_name,' ',h.last_name) full_name,
 h.position,h.org_role,pr.user_id,2 priority,'หัวหน้ากลุ่มงาน'::text stage
 from subject s
 join public.staff_directory h on h.active and h.source_row<>2
 and replace(trim(coalesce(h.org_role,'')),' ','')='หัวหน้ากลุ่มงาน'
 left join public.profiles pr on pr.staff_directory_id=h.source_row
 where exists (
  select 1
  from regexp_split_to_table(concat_ws('|',nullif(s.submitter_group,''),nullif(s.submitter_extra_groups,''),nullif(s.parent_group,'')),'[,;|]') sg(group_name)
  join regexp_split_to_table(concat_ws('|',nullif(h.nursing_group,''),nullif(h.extra_nursing_group_names,'')),'[,;|]') hg(group_name)
    on trim(hg.group_name)=trim(sg.group_name)
  where trim(sg.group_name)<>''
 )
),
selected as (
 select h.source_row,concat_ws('',h.prefix,h.first_name,' ',h.last_name) full_name,h.position,h.org_role,pr.user_id,0 priority,'รักษาการหัวหน้าพยาบาล'::text stage
 from public.staff_directory h left join public.profiles pr on pr.staff_directory_id=h.source_row
 where h.active and h.source_row=2 and exists(select 1 from subject s where s.staff_directory_id=2)
 union all
 select h.source_row,concat_ws('',h.prefix,h.first_name,' ',h.last_name),h.position,h.org_role,pr.user_id,0,'รักษาการหัวหน้าพยาบาล'
 from subject s join public.staff_directory h on h.active and h.source_row=2
 left join public.profiles pr on pr.staff_directory_id=h.source_row
 where coalesce(s.submitter_org_role,'')='หัวหน้ากลุ่มงาน' and s.staff_directory_id<>2
 union all
 select gh.source_row,gh.full_name,gh.position,gh.org_role,gh.user_id,gh.priority,gh.stage
 from subject s cross join lateral(select * from group_heads order by source_row limit 1) gh
 where coalesce(s.submitter_org_role,'')='หัวหน้างาน'
 union all
 select uh.source_row,uh.full_name,uh.position,uh.org_role,uh.user_id,uh.priority,uh.stage
 from subject s cross join lateral(select * from unit_heads order by source_row limit 1) uh
 where coalesce(s.submitter_org_role,'') not in ('หัวหน้างาน','หัวหน้ากลุ่มงาน') and s.staff_directory_id<>2
 union all
 select gh.source_row,gh.full_name,gh.position,gh.org_role,gh.user_id,gh.priority,gh.stage
 from subject s cross join lateral(select * from group_heads order by source_row limit 1) gh
 where coalesce(s.submitter_org_role,'') not in ('หัวหน้างาน','หัวหน้ากลุ่มงาน')
 and s.staff_directory_id<>2 and not exists(select 1 from unit_heads)
 union all
 select h.source_row,concat_ws('',h.prefix,h.first_name,' ',h.last_name),h.position,h.org_role,pr.user_id,3,'รักษาการหัวหน้าพยาบาล'
 from subject s join public.staff_directory h on h.active and h.source_row=2
 left join public.profiles pr on pr.staff_directory_id=h.source_row
 where coalesce(s.submitter_org_role,'') not in ('หัวหน้างาน','หัวหน้ากลุ่มงาน')
 and s.staff_directory_id<>2 and not exists(select 1 from unit_heads) and not exists(select 1 from group_heads)
)
select x.source_row,x.full_name,x.position,x.org_role,x.user_id,x.stage
from selected x order by x.priority,x.source_row limit 1;
$function$

