-- Snapshot of the approval hierarchy and registration role derivation deployed to Supabase.
-- This migration mirrors the live function definitions so the repository remains reproducible.

CREATE OR REPLACE FUNCTION public.approval_level(p_user uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select coalesce((select case
   when p.role='admin' or p.position in ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล') then 3
   when exists(select 1 from public.position_designations d
      where regexp_replace(lower(trim(d.full_name)),'[[:space:]]','','g')=regexp_replace(lower(trim(p.full_name)),'[[:space:]]','','g')
        and d.position in ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล')) then 3
   when coalesce(p.org_role,sd.org_role)='หัวหน้ากลุ่มงาน' or p.position='หัวหน้ากลุ่มงานการพยาบาล' then 2
   when coalesce(p.org_role,sd.org_role)='หัวหน้างาน' or p.position='หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 1 else 0 end
 from public.profiles p left join public.staff_directory sd on sd.source_row=p.staff_directory_id
 where p.user_id=p_user limit 1),0)
$function$;

CREATE OR REPLACE FUNCTION public.person_level(pid uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select coalesce((select case when p.user_id is not null then public.approval_level(p.user_id)
   when sd.org_role='หัวหน้ากลุ่มงาน' then 2 when sd.org_role='หัวหน้างาน' then 1 else 0 end
 from public.people p left join public.staff_directory sd on sd.source_row=p.staff_directory_id
 where p.id=pid limit 1),0)
$function$;

CREATE OR REPLACE FUNCTION public.approver_of(p_person uuid)
 RETURNS TABLE(approver_name text, approver_position text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 with s as (select p.unit_id,public.person_level(p.id) lvl,
   coalesce(sd.nursing_group,u.parent_group,u.name) grp
   from public.people p left join public.staff_directory sd on sd.source_row=p.staff_directory_id
   left join public.units u on u.id=p.unit_id where p.id=p_person),
 c as (select h.full_name n,public.approval_level(h.user_id) hl,
   (h.unit_id=s.unit_id) same_unit,s.lvl,
   case when public.approval_level(h.user_id)=3 then 'หัวหน้าพยาบาล/รักษาการหัวหน้าพยาบาล'
        when public.approval_level(h.user_id)=2 then 'หัวหน้ากลุ่มงาน' else 'หัวหน้างาน' end pos
   from s join public.profiles h on h.role in ('head','admin')
   left join public.profile_units pu on pu.user_id=h.user_id and pu.unit_id=s.unit_id and pu.approved
   left join public.units hu on hu.id=h.unit_id
   where public.approval_level(h.user_id)>s.lvl and
    (h.unit_id=s.unit_id or pu.unit_id is not null or public.approval_level(h.user_id)=3 or
     (public.approval_level(h.user_id)=2 and coalesce(h.nursing_group,hu.parent_group,hu.name)=s.grp))
   and (public.approval_level(h.user_id)=s.lvl+1 or not exists(
     select 1 from public.profiles mid left join public.profile_units mp on mp.user_id=mid.user_id and mp.unit_id=s.unit_id and mp.approved
     left join public.units mu on mu.id=mid.unit_id
     where mid.role in ('head','admin') and public.approval_level(mid.user_id)=s.lvl+1
       and (mid.unit_id=s.unit_id or mp.unit_id is not null or public.approval_level(mid.user_id)=3 or
         (public.approval_level(mid.user_id)=2 and coalesce(mid.nursing_group,mu.parent_group,mu.name)=s.grp))
   )))
 select n,pos from c order by hl,same_unit desc,n limit 1
$function$;

CREATE OR REPLACE FUNCTION public.can_approve_person(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select exists(select 1 from public.people p join public.profiles me on me.user_id=auth.uid()
 left join public.staff_directory sd on sd.source_row=p.staff_directory_id
 left join public.units u on u.id=p.unit_id
 where p.id=pid and p.user_id is distinct from auth.uid() and (
   me.role='admin' or (me.role='head' and public.approval_level(me.user_id)>public.person_level(p.id)
    and p.unit_id in (select public.my_units())
    and (public.approval_level(me.user_id)=public.person_level(p.id)+1 or not exists(
      select 1 from public.profiles mid left join public.profile_units pu on pu.user_id=mid.user_id and pu.unit_id=p.unit_id and pu.approved
      left join public.units mu on mu.id=mid.unit_id
      where mid.role in ('head','admin') and public.approval_level(mid.user_id)=public.person_level(p.id)+1
       and (mid.unit_id=p.unit_id or pu.unit_id is not null or public.approval_level(mid.user_id)=3 or
        (public.approval_level(mid.user_id)=2 and coalesce(mid.nursing_group,mu.parent_group,mu.name)=coalesce(sd.nursing_group,u.parent_group,u.name)))
    ))
   )
 ))
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 m jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
 pf text := trim(coalesce(m->>'prefix',''));
 fn text := trim(coalesce(m->>'first_name',''));
 ln text := trim(coalesce(m->>'last_name',''));
 ps text := nullif(m->>'position','');
 uid int := nullif(m->>'unit_id','')::int;
 sd public.staff_directory%rowtype;
 fname text;
 pid uuid;
 assigned_role text := 'staff';
begin
 fname := trim(concat_ws(' ',nullif(pf,''),nullif(fn,''),nullif(ln,'')));
 select * into sd from public.staff_directory s where s.active and
  ((nullif(m->>'staff_directory_id','') is not null and s.source_row=(m->>'staff_directory_id')::int)
   or lower(trim(s.full_name))=lower(fname)
   or lower(trim(concat_ws(' ',s.prefix,s.first_name,s.last_name)))=lower(fname))
 order by case when nullif(m->>'staff_directory_id','') is not null and s.source_row=(m->>'staff_directory_id')::int then 0 else 1 end limit 1;
 if found then
   fname:=coalesce(nullif(sd.full_name,''),fname); pf:=coalesce(sd.prefix,pf); fn:=coalesce(sd.first_name,fn); ln:=coalesce(sd.last_name,ln); ps:=coalesce(sd.position,ps);
   select id into uid from public.units where name=sd.unit_name limit 1;
   if uid is null then select id into uid from public.units where name=sd.nursing_group limit 1; end if;
   if sd.org_role in ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล') or exists(
      select 1 from public.position_designations d
      where regexp_replace(lower(trim(d.full_name)),'[[:space:]]','','g')=regexp_replace(lower(trim(sd.full_name)),'[[:space:]]','','g')
        and d.position in ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล')) then
     assigned_role:='admin';
   elsif sd.org_role in ('หัวหน้างาน','หัวหน้ากลุ่มงาน') then assigned_role:='head';
   end if;
 end if;
 insert into public.profiles(user_id,full_name,prefix,first_name,last_name,position,role,unit_id,
   staff_directory_id,org_role,staff_group,staff_type,nursing_group,extra_unit_names,extra_nursing_group_names)
 values(new.id,fname,pf,fn,ln,ps,assigned_role,uid,
   case when sd.source_row is not null then sd.source_row else null end,
   case when sd.source_row is not null then sd.org_role else null end,
   sd.staff_group,sd.staff_type,sd.nursing_group,sd.extra_unit_names,sd.extra_nursing_group_names);
 if ps is not null and uid is not null and fn<>'' then
   select id into pid from public.people where unit_id=uid and name=fname and user_id is null limit 1;
   if pid is not null then
     update public.people set user_id=new.id,position=ps,prefix=pf,first_name=fn,last_name=ln,staff_directory_id=sd.source_row where id=pid;
   else
     insert into public.people(prefix,first_name,last_name,name,position,unit_id,user_id,staff_directory_id)
     values(pf,fn,ln,fname,ps,uid,new.id,sd.source_row);
   end if;
 end if;
 return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.my_approval_level()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.approval_level(auth.uid()) $function$;

CREATE OR REPLACE FUNCTION public.person_levels()
 RETURNS TABLE(person_id uuid, lvl integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ select p.id, public.person_level(p.id) from public.people p $function$;
