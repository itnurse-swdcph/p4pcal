-- Fix registration trigger: staff_directory stores prefix/first_name/last_name, not full_name.
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
 select * into sd
 from public.staff_directory s
 where s.active and (
   (nullif(m->>'staff_directory_id','') is not null and s.source_row=(m->>'staff_directory_id')::int)
   or regexp_replace(lower(trim(concat_ws(' ',s.prefix,s.first_name,s.last_name))),'[[:space:]]','','g')
      = regexp_replace(lower(trim(fname)),'[[:space:]]','','g')
 )
 order by case when nullif(m->>'staff_directory_id','') is not null and s.source_row=(m->>'staff_directory_id')::int then 0 else 1 end
 limit 1;
 if found then
   fname := trim(concat_ws(' ',nullif(sd.prefix,''),nullif(sd.first_name,''),nullif(sd.last_name,'')));
   pf := coalesce(sd.prefix,pf);
   fn := coalesce(sd.first_name,fn);
   ln := coalesce(sd.last_name,ln);
   ps := coalesce(sd.position,ps);
   select id into uid from public.units where name=sd.unit_name limit 1;
   if uid is null then select id into uid from public.units where name=sd.nursing_group limit 1; end if;
   if sd.org_role in ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล') or exists(
      select 1 from public.position_designations d
      where regexp_replace(lower(trim(d.full_name)),'[[:space:]]','','g')
        = regexp_replace(lower(trim(concat_ws(' ',sd.prefix,sd.first_name,sd.last_name))),'[[:space:]]','','g')
        and d.position in ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล')
   ) then
     assigned_role := 'admin';
   elsif sd.org_role in ('หัวหน้างาน','หัวหน้ากลุ่มงาน') then
     assigned_role := 'head';
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
$function$
