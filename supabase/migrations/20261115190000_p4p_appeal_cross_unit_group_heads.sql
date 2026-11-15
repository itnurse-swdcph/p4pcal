-- Source migration for cross-unit P4P appeals and group-head staff without sub-units.
-- Admin may select staff across units/groups; each person's unlock is linked to their own unit/group submission.
CREATE OR REPLACE FUNCTION public.p4p_appeal_dashboard(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_admin boolean:=public.p4p_is_appeal_admin(); v_role text; v_people jsonb; v_appeals jsonb;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if p_month is null then raise exception 'กรุณาระบุเดือน'; end if;
  select role into v_role from public.profiles where user_id=auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object(
    'staff_directory_id',p.staff_directory_id,'person_id',p.id,'name',p.name,
    'position',p.position,'unit_id',p.unit_id,
    'unit_name',coalesce(u.name,nullif(d.unit_name,''),nullif(d.nursing_group,''),'หัวหน้ากลุ่มงานไม่สังกัดหน่วยงานย่อย'),
    'group_name',d.nursing_group,'org_role',d.org_role
  ) order by p.name),'[]'::jsonb) into v_people
  from public.people p
  left join public.units u on u.id=p.unit_id
  left join public.staff_directory d on d.source_row=p.staff_directory_id
  where p.active=true and p.staff_directory_id is not null
    and (v_admin or (v_role in ('head','group_head') and public.can_approve_person(p.id)) or p.user_id=auth.uid());
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'month',a.month,'scope_type',a.scope_type,'unit_id',a.unit_id,
    'unit_name',case when a.unit_id is not null then u.name
      when (select count(*) from public.p4p_appeal_people ap where ap.appeal_id=a.id)>1 then 'หลายหน่วยงาน/กลุ่มงาน'
      else coalesce((select coalesce(un.name,nullif(sd.nursing_group,''),'หัวหน้ากลุ่มงาน') from public.p4p_appeal_people ap
        join public.people pp on pp.id=ap.person_id left join public.units un on un.id=pp.unit_id
        left join public.staff_directory sd on sd.source_row=pp.staff_directory_id
        where ap.appeal_id=a.id limit 1),'ไม่ระบุหน่วยงาน') end,
    'reason',a.reason,'details',a.details,'status',a.status,
    'submitter_name',a.submitter_name,'created_at',a.created_at,'expires_at',a.expires_at,
    'reviewer_name',a.reviewer_name,'review_comment',a.review_comment,
    'people',coalesce((select jsonb_agg(jsonb_build_object(
      'staff_directory_id',ap.staff_directory_id,'person_id',ap.person_id,'name',p.name,
      'position',p.position,'unit_name',coalesce(un.name,nullif(sd.unit_name,''),nullif(sd.nursing_group,''),'หัวหน้ากลุ่มงานไม่สังกัดหน่วยงานย่อย')
    ) order by p.name) from public.p4p_appeal_people ap join public.people p on p.id=ap.person_id
      left join public.units un on un.id=p.unit_id left join public.staff_directory sd on sd.source_row=p.staff_directory_id
      where ap.appeal_id=a.id),'[]'::jsonb)
  ) order by a.created_at desc),'[]'::jsonb) into v_appeals
  from public.p4p_appeals a left join public.units u on u.id=a.unit_id
  where a.month=date_trunc('month',p_month)::date
    and (v_admin or v_role='committee' or a.submitted_by=auth.uid()
      or exists(select 1 from public.p4p_appeal_people ap join public.people p on p.id=ap.person_id
        where ap.appeal_id=a.id and p.user_id=auth.uid()));
  return jsonb_build_object('is_admin',v_admin,'role',v_role,
    'month_closed',exists(select 1 from public.p4p_closed_months c where c.month=date_trunc('month',p_month)::date),
    'staff',v_people,'appeals',v_appeals);
end;
$function$


CREATE OR REPLACE FUNCTION public.p4p_create_appeal(p_month date, p_staff_directory_ids integer[], p_reason text, p_details text DEFAULT ''::text, p_direct boolean DEFAULT false, p_days integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_admin boolean:=public.p4p_is_appeal_admin(); v_role text; v_ids integer[];
  v_unit integer; v_unit_count integer; v_scope_count integer; v_submission uuid;
  v_appeal uuid; v_person record; v_name text; v_unlock uuid; v_expiry timestamptz;
  v_count integer; v_selected_count integer;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select role into v_role from public.profiles where user_id=auth.uid();
  if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'ระบุเดือนเป็นวันแรกของเดือน'; end if;
  if not exists(select 1 from public.p4p_closed_months where month=p_month)
    or not exists(select 1 from public.p4p_monthly_reviews where month=p_month and status='closed') then
    raise exception 'ยื่นอุทธรณ์ได้หลังปิดยอดและประกาศผลแล้วเท่านั้น';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'; end if;
  if coalesce(cardinality(p_staff_directory_ids),0)=0 then raise exception 'กรุณาเลือกรายชื่อเจ้าหน้าที่อย่างน้อย 1 คน'; end if;
  if p_direct and not v_admin then raise exception 'เฉพาะ Admin กลางเท่านั้นที่เปิดสิทธิ์โดยตรงได้'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_staff_directory_ids) x where x is not null;
  v_selected_count:=cardinality(v_ids);
  select count(*) into v_count from public.people p join public.staff_directory d on d.source_row=p.staff_directory_id
    where p.staff_directory_id=any(v_ids) and p.active=true and d.active=true;
  if v_count<>v_selected_count then raise exception 'พบรายชื่อที่ไม่อยู่ในทะเบียนบุคลากรหรือไม่มีบัญชีบุคลากรในระบบ'; end if;

  select count(distinct p.unit_id),
    count(distinct case when p.unit_id is not null then 'UNIT:'||p.unit_id::text
      else 'GROUP:'||coalesce(nullif(d.nursing_group,''),nullif(d.org_role,''),'') end)
  into v_unit_count,v_scope_count
  from public.people p left join public.staff_directory d on d.source_row=p.staff_directory_id
  where p.staff_directory_id=any(v_ids);
  if not v_admin and v_scope_count<>1 then
    raise exception 'หัวหน้าหน่วยงานยื่นได้เฉพาะเจ้าหน้าที่ในหน่วยงานหรือกลุ่มงานที่รับผิดชอบเดียวกัน';
  end if;
  if not v_admin and v_role in ('head','group_head') then
    if exists(select 1 from public.people p where p.staff_directory_id=any(v_ids) and not public.can_approve_person(p.id)) then
      raise exception 'ไม่มีสิทธิ์ยื่นอุทธรณ์แทนเจ้าหน้าที่บางรายในรายการนี้';
    end if;
  elsif not v_admin then
    if v_selected_count<>1 or not exists(select 1 from public.people p where p.staff_directory_id=v_ids[1] and p.user_id=auth.uid()) then
      raise exception 'เจ้าหน้าที่ทั่วไปยื่นอุทธรณ์ได้เฉพาะคะแนนของตนเอง';
    end if;
  end if;

  -- Each selected person must have a matching submitted unit OR group record.
  if exists(
    select 1 from public.people p left join public.staff_directory d on d.source_row=p.staff_directory_id
    where p.staff_directory_id=any(v_ids) and not exists(
      select 1 from public.p4p_month_submissions s
      where s.month=p_month and s.status in ('submitted','resubmitted','reviewed')
        and ((p.unit_id is not null and s.scope_type='unit' and s.unit_id=p.unit_id)
          or (p.unit_id is null and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
            and s.scope_type='group'
            and (trim(coalesce(d.nursing_group,''))=s.group_name
              or s.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]')))))
    )
  ) then raise exception 'มีเจ้าหน้าที่บางรายที่ยังไม่พบรายการส่งผลงานของหน่วยงาน/กลุ่มงานในเดือนนี้'; end if;

  select s.id into v_submission
  from public.people p left join public.staff_directory d on d.source_row=p.staff_directory_id
  join lateral (
    select s0.id from public.p4p_month_submissions s0
    where s0.month=p_month and s0.status in ('submitted','resubmitted','reviewed')
      and ((p.unit_id is not null and s0.scope_type='unit' and s0.unit_id=p.unit_id)
        or (p.unit_id is null and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
          and s0.scope_type='group'
          and (trim(coalesce(d.nursing_group,''))=s0.group_name
            or s0.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]')))))
    order by s0.updated_at desc nulls last limit 1
  ) s on true
  where p.staff_directory_id=any(v_ids) order by p.name limit 1;
  if v_submission is null then raise exception 'ไม่พบรายการส่งผลงานของรายชื่อที่เลือก'; end if;

  select min(p.unit_id) into v_unit from public.people p where p.staff_directory_id=any(v_ids);
  if v_unit_count<>1 or exists(select 1 from public.people p where p.staff_directory_id=any(v_ids) and p.unit_id is null) then v_unit:=null; end if;
  select coalesce(nullif(trim(full_name),''),username) into v_name from public.profiles where user_id=auth.uid();
  insert into public.p4p_appeals(month,submission_id,scope_type,unit_id,submitted_by,submitter_name,reason,details,status)
  values(p_month,v_submission,case when v_selected_count>1 then 'unit' else 'person' end,v_unit,
    auth.uid(),coalesce(v_name,''),trim(p_reason),trim(coalesce(p_details,'')),case when p_direct then 'approved' else 'pending' end)
  returning id into v_appeal;
  insert into public.p4p_appeal_people(appeal_id,staff_directory_id,person_id)
    select v_appeal,p.staff_directory_id,p.id from public.people p where p.staff_directory_id=any(v_ids) and p.active=true;
  insert into public.p4p_appeal_audit(appeal_id,actor_id,event_type,details)
    values(v_appeal,auth.uid(),case when p_direct then 'admin_direct_approved' else 'submitted' end,
      jsonb_build_object('staff_directory_ids',v_ids,'unit_count',v_unit_count,'scope_count',v_scope_count,'reason',trim(p_reason),'direct',p_direct));
  if p_direct then
    v_expiry:=now()+make_interval(days=>greatest(1,least(coalesce(p_days,5),14)));
    update public.p4p_appeals set reviewed_by=auth.uid(),reviewer_name=v_name,reviewed_at=now(),
      review_comment='Admin กลางอนุมัติและเปิดสิทธิ์โดยตรง',expires_at=v_expiry,updated_at=now() where id=v_appeal;
    for v_person in
      select p.id,p.staff_directory_id,s.id as submission_id
      from public.people p left join public.staff_directory d on d.source_row=p.staff_directory_id
      join lateral (
        select s0.id from public.p4p_month_submissions s0
        where s0.month=p_month and s0.status in ('submitted','resubmitted','reviewed')
          and ((p.unit_id is not null and s0.scope_type='unit' and s0.unit_id=p.unit_id)
            or (p.unit_id is null and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
              and s0.scope_type='group'
              and (trim(coalesce(d.nursing_group,''))=s0.group_name
                or s0.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]')))))
        order by s0.updated_at desc nulls last limit 1
      ) s on true
      where p.staff_directory_id=any(v_ids) and p.active=true
    loop
      insert into public.p4p_person_month_unlocks(submission_id,staff_directory_id,person_id,month,reason,status,opened_by,opened_at,expires_at,appeal_id)
      values(v_person.submission_id,v_person.staff_directory_id,v_person.id,p_month,trim(p_reason),'open',auth.uid(),now(),v_expiry,v_appeal)
      on conflict(submission_id,staff_directory_id) where status='open'
      do update set reason=excluded.reason,opened_by=excluded.opened_by,opened_at=now(),expires_at=excluded.expires_at,appeal_id=excluded.appeal_id
      returning id into v_unlock;
      update public.p4p_appeal_people set unlock_id=v_unlock where appeal_id=v_appeal and person_id=v_person.id;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'appeal_id',v_appeal,'status',case when p_direct then 'approved' else 'pending' end,
    'selected_count',v_selected_count,'unit_count',v_unit_count);
end;
$function$


CREATE OR REPLACE FUNCTION public.p4p_decide_appeal(p_appeal_id uuid, p_decision text, p_comment text DEFAULT ''::text, p_days integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare a public.p4p_appeals%rowtype; v_admin boolean:=public.p4p_is_appeal_admin(); v_name text;
  v_expiry timestamptz; v_person record; v_unlock uuid;
begin
  if auth.uid() is null or not (v_admin or public.p4p_can_act_as_committee()) then raise exception 'ไม่มีสิทธิ์พิจารณาอุทธรณ์'; end if;
  if p_decision not in ('approved','rejected','needs_info') then raise exception 'ผลการพิจารณาไม่ถูกต้อง'; end if;
  select * into a from public.p4p_appeals where id=p_appeal_id for update;
  if not found or a.status not in ('pending','needs_info','resubmitted') then raise exception 'คำขอนี้ไม่อยู่ในสถานะที่พิจารณาได้'; end if;
  select coalesce(nullif(trim(full_name),''),username) into v_name from public.profiles where user_id=auth.uid();
  v_expiry:=now()+make_interval(days=>greatest(1,least(coalesce(p_days,5),14)));
  update public.p4p_appeals set status=p_decision,reviewed_by=auth.uid(),reviewer_name=v_name,
    review_comment=trim(coalesce(p_comment,'')),reviewed_at=now(),
    expires_at=case when p_decision='approved' then v_expiry else null end,updated_at=now() where id=p_appeal_id;
  insert into public.p4p_appeal_audit(appeal_id,actor_id,event_type,details)
    values(p_appeal_id,auth.uid(),p_decision,jsonb_build_object('comment',trim(coalesce(p_comment,'')),'days',p_days));
  if p_decision='approved' then
    for v_person in
      select ap.staff_directory_id,ap.person_id,s.id as submission_id
      from public.p4p_appeal_people ap join public.people p on p.id=ap.person_id
      left join public.staff_directory d on d.source_row=p.staff_directory_id
      join lateral (
        select s0.id from public.p4p_month_submissions s0
        where s0.month=a.month and s0.status in ('submitted','resubmitted','reviewed')
          and ((p.unit_id is not null and s0.scope_type='unit' and s0.unit_id=p.unit_id)
            or (p.unit_id is null and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
              and s0.scope_type='group'
              and (trim(coalesce(d.nursing_group,''))=s0.group_name
                or s0.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]')))))
        order by s0.updated_at desc nulls last limit 1
      ) s on true
      where ap.appeal_id=p_appeal_id
    loop
      insert into public.p4p_person_month_unlocks(submission_id,staff_directory_id,person_id,month,reason,status,opened_by,opened_at,expires_at,appeal_id)
      values(v_person.submission_id,v_person.staff_directory_id,v_person.person_id,a.month,a.reason,'open',auth.uid(),now(),v_expiry,p_appeal_id)
      on conflict(submission_id,staff_directory_id) where status='open'
      do update set reason=excluded.reason,opened_by=excluded.opened_by,opened_at=now(),expires_at=excluded.expires_at,appeal_id=excluded.appeal_id
      returning id into v_unlock;
      update public.p4p_appeal_people set unlock_id=v_unlock where appeal_id=p_appeal_id and person_id=v_person.person_id;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'appeal_id',p_appeal_id,'status',p_decision,'expires_at',case when p_decision='approved' then v_expiry else null end);
end;
$function$


revoke all on function public.p4p_appeal_dashboard(date) from public,anon;
grant execute on function public.p4p_appeal_dashboard(date) to authenticated;
revoke all on function public.p4p_create_appeal(date,integer[],text,text,boolean,integer) from public,anon;
grant execute on function public.p4p_create_appeal(date,integer[],text,text,boolean,integer) to authenticated;
revoke all on function public.p4p_decide_appeal(uuid,text,text,integer) from public,anon;
grant execute on function public.p4p_decide_appeal(uuid,text,text,integer) to authenticated;
