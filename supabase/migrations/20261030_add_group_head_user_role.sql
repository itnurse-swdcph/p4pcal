alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['staff','head','group_head','committee','admin']::text[]));

-- Normalize group-head authorization to the existing head policy branch; scope remains limited by my_units().
create or replace function public.my_role()
returns text
language sql stable security definer
set search_path to 'public'
as $function$
  select case when role = 'group_head' then 'head' else role end
  from public.profiles where user_id = auth.uid()
$function$;

create or replace function public.approver_of(p_person uuid)
returns table(approver_name text, approver_position text)
language sql stable security definer
set search_path to 'public'
as $function$
 with s as (
   select p.unit_id, public.person_level(p.id) lvl,
          coalesce(sd.nursing_group,u.parent_group,u.name) grp
   from public.people p
   left join public.staff_directory sd on sd.source_row=p.staff_directory_id
   left join public.units u on u.id=p.unit_id
   where p.id=p_person
 ), c as (
   select h.full_name n, public.approval_level(h.user_id) hl,
          (h.unit_id=s.unit_id) same_unit, s.lvl,
          case when public.approval_level(h.user_id)=3 then 'หัวหน้าพยาบาล/รักษาการหัวหน้าพยาบาล'
               when public.approval_level(h.user_id)=2 then 'หัวหน้ากลุ่มงาน' else 'หัวหน้างาน' end pos
   from s join public.profiles h on h.role in ('head','group_head','admin')
   left join public.profile_units pu on pu.user_id=h.user_id and pu.unit_id=s.unit_id and pu.approved
   left join public.units hu on hu.id=h.unit_id
   where public.approval_level(h.user_id)>s.lvl
     and (h.unit_id=s.unit_id or pu.unit_id is not null or public.approval_level(h.user_id)=3
          or (public.approval_level(h.user_id)=2 and coalesce(h.nursing_group,hu.parent_group,hu.name)=s.grp))
     and (public.approval_level(h.user_id)=s.lvl+1 or not exists (
       select 1 from public.profiles mid
       left join public.profile_units mp on mp.user_id=mid.user_id and mp.unit_id=s.unit_id and mp.approved
       left join public.units mu on mu.id=mid.unit_id
       where mid.role in ('head','group_head','admin')
         and public.approval_level(mid.user_id)=s.lvl+1
         and (mid.unit_id=s.unit_id or mp.unit_id is not null or public.approval_level(mid.user_id)=3
              or (public.approval_level(mid.user_id)=2 and coalesce(mid.nursing_group,mu.parent_group,mu.name)=s.grp))
     ))
 )
 select n,pos from c order by hl,same_unit desc,n limit 1
$function$;

create or replace function public.can_approve_person(pid uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $function$
 select exists(
   select 1
   from public.people p
   join public.profiles me on me.user_id = auth.uid()
   left join public.staff_directory sd on sd.source_row = p.staff_directory_id
   left join public.units u on u.id = p.unit_id
   left join public.staff_directory me_sd on me_sd.source_row = me.staff_directory_id
   left join public.units me_unit on me_unit.id = me.unit_id
   where p.id = pid
     and p.user_id is distinct from auth.uid()
     and (
       me.role = 'admin'
       or (
         me.role in ('head','group_head')
         and public.approval_level(me.user_id) > public.person_level(p.id)
         and (
           p.unit_id in (select public.my_units())
           or (p.unit_id is null and exists (
             select 1
             from regexp_split_to_table(
               concat_ws('|', nullif(me.nursing_group,''), nullif(me_sd.nursing_group,''),
                         nullif(me.extra_nursing_group_names,''), nullif(me_sd.extra_nursing_group_names,'')),
               '[,;|]'
             ) mg(group_name)
             where trim(mg.group_name) = trim(coalesce(sd.nursing_group,''))
                or exists (select 1 from public.units gu
                           where trim(gu.parent_group) = trim(mg.group_name)
                             and gu.id in (select public.my_units()))
           ))
         )
         and (
           public.approval_level(me.user_id) = public.person_level(p.id) + 1
           or not exists (
             select 1
             from public.profiles mid
             left join public.profile_units pu on pu.user_id = mid.user_id and pu.unit_id = p.unit_id and pu.approved
             left join public.units mu on mu.id = mid.unit_id
             left join public.staff_directory mid_sd on mid_sd.source_row = mid.staff_directory_id
             where mid.role in ('head','group_head','admin')
               and public.approval_level(mid.user_id) = public.person_level(p.id) + 1
               and (
                 mid.unit_id = p.unit_id or pu.unit_id is not null
                 or exists (
                   select 1 from regexp_split_to_table(
                     concat_ws('|', nullif(mid_sd.extra_unit_names,''), nullif(mid.extra_unit_names,'')), '[,;|]'
                   ) extra(unit_name)
                   join public.units eu on trim(eu.name) = trim(extra.unit_name)
                   where eu.id = p.unit_id
                 )
                 or public.approval_level(mid.user_id) = 3
                 or (
                   public.approval_level(mid.user_id) = 2
                   and exists (
                     select 1 from regexp_split_to_table(
                       concat_ws('|', nullif(mid.nursing_group,''), nullif(mid_sd.nursing_group,''),
                                 nullif(mid.extra_nursing_group_names,''), nullif(mid_sd.extra_nursing_group_names,'')),
                       '[,;|]'
                     ) mg(group_name)
                     where trim(mg.group_name) = trim(coalesce(sd.nursing_group,u.parent_group,u.name))
                   )
                 )
               )
           )
         )
       )
     )
 )
$function$;

update public.profiles
set role = 'group_head'
where staff_directory_id = 273
  and full_name = 'นางจรัญญา นาคบุตรศรี'
  and org_role = 'หัวหน้ากลุ่มงาน';
