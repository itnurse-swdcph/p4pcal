-- P4P post-publication appeals. Closed-month records remain locked except for
-- approved staff listed in an appeal. Permissions are person-scoped and expire.
create table if not exists public.p4p_appeals (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  submission_id uuid not null references public.p4p_month_submissions(id),
  scope_type text not null check (scope_type in ('person','unit')),
  unit_id integer references public.units(id),
  submitted_by uuid not null references auth.users(id),
  submitter_name text not null default '',
  reason text not null,
  details text not null default '',
  status text not null default 'pending' check (status in ('pending','needs_info','approved','rejected','editing','resubmitted','closed')),
  reviewed_by uuid references auth.users(id),
  reviewer_name text,
  review_comment text,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month = date_trunc('month', month)::date)
);
create table if not exists public.p4p_appeal_people (
  id uuid primary key default gen_random_uuid(),
  appeal_id uuid not null references public.p4p_appeals(id) on delete cascade,
  staff_directory_id integer not null,
  person_id uuid not null references public.people(id),
  unlock_id uuid references public.p4p_person_month_unlocks(id),
  created_at timestamptz not null default now(),
  unique (appeal_id, staff_directory_id),
  unique (appeal_id, person_id)
);
create table if not exists public.p4p_appeal_audit (
  id bigserial primary key,
  appeal_id uuid not null references public.p4p_appeals(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.p4p_person_month_unlocks add column if not exists expires_at timestamptz;
alter table public.p4p_person_month_unlocks add column if not exists appeal_id uuid references public.p4p_appeals(id);
create index if not exists p4p_appeals_month_status_idx on public.p4p_appeals(month,status,created_at desc);
create index if not exists p4p_appeal_people_staff_idx on public.p4p_appeal_people(staff_directory_id);
alter table public.p4p_appeals enable row level security;
alter table public.p4p_appeal_people enable row level security;
alter table public.p4p_appeal_audit enable row level security;
revoke all on public.p4p_appeals, public.p4p_appeal_people, public.p4p_appeal_audit from anon, authenticated;

create or replace function public.p4p_is_appeal_admin()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'
      and p.staff_directory_id is null and p.username in ('11405','11450')
  );
$$;
revoke all on function public.p4p_is_appeal_admin() from public,anon;
grant execute on function public.p4p_is_appeal_admin() to authenticated;

create or replace function public.p4p_appeal_dashboard(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_admin boolean:=public.p4p_is_appeal_admin(); v_role text; v_people jsonb; v_appeals jsonb;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select role into v_role from public.profiles where user_id=auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('staff_directory_id',p.staff_directory_id,'person_id',p.id,
    'name',p.name,'position',p.position,'unit_id',p.unit_id,'unit_name',u.name) order by p.name),'[]'::jsonb)
  into v_people from public.people p left join public.units u on u.id=p.unit_id
  where p.active=true and p.staff_directory_id is not null
    and (v_admin or (v_role in ('head','group_head') and public.can_approve_person(p.id)) or p.user_id=auth.uid());
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'month',a.month,'scope_type',a.scope_type,
    'unit_id',a.unit_id,'unit_name',u.name,'reason',a.reason,'details',a.details,'status',a.status,
    'submitter_name',a.submitter_name,'created_at',a.created_at,'expires_at',a.expires_at,
    'reviewer_name',a.reviewer_name,'review_comment',a.review_comment,
    'people',coalesce((select jsonb_agg(jsonb_build_object('staff_directory_id',ap.staff_directory_id,
      'person_id',ap.person_id,'name',p.name,'position',p.position) order by p.name)
      from public.p4p_appeal_people ap join public.people p on p.id=ap.person_id where ap.appeal_id=a.id),'[]'::jsonb)
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
$$;
revoke all on function public.p4p_appeal_dashboard(date) from public,anon;
grant execute on function public.p4p_appeal_dashboard(date) to authenticated;

create or replace function public.p4p_create_appeal(
  p_month date,p_staff_directory_ids integer[],p_reason text,p_details text default '',
  p_direct boolean default false,p_days integer default 5
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_admin boolean:=public.p4p_is_appeal_admin(); v_role text; v_ids integer[]; v_unit integer;
  v_submission uuid; v_appeal uuid; v_person record; v_name text; v_unlock uuid; v_expiry timestamptz; v_count integer;
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
  select min(p.unit_id),count(*) into v_unit,v_count from public.people p
    join public.staff_directory d on d.source_row=p.staff_directory_id
    where p.staff_directory_id=any(v_ids) and p.active=true and d.active=true;
  if v_count<>cardinality(v_ids) then raise exception 'พบรายชื่อที่ไม่อยู่ในทะเบียนบุคลากรหรือไม่มีบัญชีบุคลากรในระบบ'; end if;
  if (select count(distinct p.unit_id) from public.people p where p.staff_directory_id=any(v_ids))<>1 then
    raise exception 'หนึ่งคำอุทธรณ์เลือกได้เฉพาะเจ้าหน้าที่ในหน่วยงานเดียวกัน';
  end if;
  if not v_admin and v_role in ('head','group_head') then
    if exists(select 1 from public.people p where p.staff_directory_id=any(v_ids) and not public.can_approve_person(p.id)) then
      raise exception 'ไม่มีสิทธิ์ยื่นอุทธรณ์แทนเจ้าหน้าที่บางรายในรายการนี้';
    end if;
  elsif not v_admin then
    if cardinality(v_ids)<>1 or not exists(select 1 from public.people p where p.staff_directory_id=v_ids[1] and p.user_id=auth.uid()) then
      raise exception 'เจ้าหน้าที่ทั่วไปยื่นอุทธรณ์ได้เฉพาะคะแนนของตนเอง';
    end if;
  end if;
  select s.id into v_submission from public.p4p_month_submissions s
    where s.month=p_month and s.scope_type='unit' and s.unit_id=v_unit and s.status in ('submitted','resubmitted','reviewed')
    order by s.updated_at desc nulls last limit 1;
  if v_submission is null then raise exception 'ไม่พบรายการส่งผลงานของหน่วยงานในเดือนที่เลือก'; end if;
  select coalesce(nullif(trim(full_name),''),username) into v_name from public.profiles where user_id=auth.uid();
  insert into public.p4p_appeals(month,submission_id,scope_type,unit_id,submitted_by,submitter_name,reason,details,status)
  values(p_month,v_submission,case when cardinality(v_ids)>1 then 'unit' else 'person' end,v_unit,auth.uid(),
    coalesce(v_name,''),trim(p_reason),trim(coalesce(p_details,'')),case when p_direct then 'approved' else 'pending' end)
  returning id into v_appeal;
  insert into public.p4p_appeal_people(appeal_id,staff_directory_id,person_id)
    select v_appeal,p.staff_directory_id,p.id from public.people p where p.staff_directory_id=any(v_ids) and p.active=true;
  insert into public.p4p_appeal_audit(appeal_id,actor_id,event_type,details)
    values(v_appeal,auth.uid(),case when p_direct then 'admin_direct_approved' else 'submitted' end,
      jsonb_build_object('staff_directory_ids',v_ids,'reason',trim(p_reason),'direct',p_direct));
  if p_direct then
    v_expiry:=now()+make_interval(days=>greatest(1,least(coalesce(p_days,5),14)));
    update public.p4p_appeals set reviewed_by=auth.uid(),reviewer_name=v_name,reviewed_at=now(),
      review_comment='Admin กลางอนุมัติและเปิดสิทธิ์โดยตรง',expires_at=v_expiry,updated_at=now() where id=v_appeal;
    for v_person in select p.id,p.staff_directory_id from public.people p where p.staff_directory_id=any(v_ids) and p.active=true loop
      insert into public.p4p_person_month_unlocks(submission_id,staff_directory_id,person_id,month,reason,status,opened_by,opened_at,expires_at,appeal_id)
      values(v_submission,v_person.staff_directory_id,v_person.id,p_month,trim(p_reason),'open',auth.uid(),now(),v_expiry,v_appeal)
      on conflict(submission_id,staff_directory_id) where status='open'
      do update set reason=excluded.reason,opened_by=excluded.opened_by,opened_at=now(),expires_at=excluded.expires_at,appeal_id=excluded.appeal_id
      returning id into v_unlock;
      update public.p4p_appeal_people set unlock_id=v_unlock where appeal_id=v_appeal and person_id=v_person.id;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'appeal_id',v_appeal,'status',case when p_direct then 'approved' else 'pending' end);
end;
$$;
revoke all on function public.p4p_create_appeal(date,integer[],text,text,boolean,integer) from public,anon;
grant execute on function public.p4p_create_appeal(date,integer[],text,text,boolean,integer) to authenticated;

create or replace function public.p4p_decide_appeal(p_appeal_id uuid,p_decision text,p_comment text default '',p_days integer default 5)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
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
    for v_person in select ap.staff_directory_id,ap.person_id from public.p4p_appeal_people ap where ap.appeal_id=p_appeal_id loop
      insert into public.p4p_person_month_unlocks(submission_id,staff_directory_id,person_id,month,reason,status,opened_by,opened_at,expires_at,appeal_id)
      values(a.submission_id,v_person.staff_directory_id,v_person.person_id,a.month,a.reason,'open',auth.uid(),now(),v_expiry,p_appeal_id)
      on conflict(submission_id,staff_directory_id) where status='open'
      do update set reason=excluded.reason,opened_by=excluded.opened_by,opened_at=now(),expires_at=excluded.expires_at,appeal_id=excluded.appeal_id
      returning id into v_unlock;
      update public.p4p_appeal_people set unlock_id=v_unlock where appeal_id=p_appeal_id and person_id=v_person.person_id;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'appeal_id',p_appeal_id,'status',p_decision,'expires_at',case when p_decision='approved' then v_expiry else null end);
end;
$$;
revoke all on function public.p4p_decide_appeal(uuid,text,text,integer) from public,anon;
grant execute on function public.p4p_decide_appeal(uuid,text,text,integer) to authenticated;

-- Preserve the closed result unless a privileged post-appeal refresh explicitly opts in.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.p4p_calc(date)'::regprocedure) into v_def;
  if position('current_setting(''p4p.force_recalculate''' in v_def)=0 then
    v_def:=replace(v_def,'if stored is not null then',
      'if stored is not null and coalesce(current_setting(''p4p.force_recalculate'', true), ''off'') <> ''on'' then');
    execute v_def;
  end if;
end;
$$;

-- Expired appeal permissions no longer pass the activity lock trigger.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.guard_p4p_submission_lock()'::regprocedure) into v_def;
  if position('u.expires_at is null' in v_def)=0 then
    v_def:=replace(v_def,'and u.status = ''open'' and u.person_id = v_person',
      'and u.status = ''open'' and u.person_id = v_person and (u.expires_at is null or u.expires_at > now())');
    if position('u.expires_at is null' in v_def)=0 then raise exception 'Could not extend P4P submission lock for appeals'; end if;
    execute v_def;
  end if;
end;
$$;

create or replace function public.p4p_close_appeal(p_appeal_id uuid,p_comment text default '')
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare a public.p4p_appeals%rowtype; v_result jsonb; v_hash text; g jsonb; v_unfinished integer;
begin
  if auth.uid() is null or not (public.p4p_is_appeal_admin() or public.p4p_can_act_as_committee()) then raise exception 'ไม่มีสิทธิ์ปิดคำอุทธรณ์'; end if;
  select * into a from public.p4p_appeals where id=p_appeal_id for update;
  if not found or a.status not in ('approved','editing','resubmitted','rejected','needs_info') then raise exception 'ไม่สามารถปิดคำขอนี้ได้'; end if;
  if a.status in ('approved','editing','resubmitted') then
    select count(*) into v_unfinished from public.logs l join public.p4p_appeal_people ap on ap.person_id=l.person_id
    where ap.appeal_id=p_appeal_id and date_trunc('month',l.work_date)::date=a.month and l.status in ('pending','draft','rejected');
    if v_unfinished>0 then raise exception 'ยังมีกิจกรรมที่รอรับรองหรือยังไม่ส่ง % รายการ กรุณาตรวจสอบก่อนปิดอุทธรณ์',v_unfinished; end if;
    update public.p4p_person_month_unlocks set status='closed',closed_at=now() where appeal_id=p_appeal_id and status='open';
    perform set_config('p4p.force_recalculate','on',true);
    v_result:=public.p4p_calc(a.month)||jsonb_build_object('closed',true,'appeal_recalculated',true,'last_appeal_id',p_appeal_id);
    v_hash:=md5(v_result::text);
    update public.p4p_closed_months set result=v_result,snapshot_hash=v_hash where month=a.month;
    update public.p4p_monthly_reviews set snapshot=v_result,snapshot_hash=v_hash,updated_at=now() where month=a.month;
    for g in select value from jsonb_array_elements(coalesce(v_result->'groups','[]'::jsonb)) loop
      insert into public.p4p_carry(pay_group,month,extra,quality)
      values((g->>'pay_group')::integer,a.month,coalesce((g->>'carry_extra_out')::numeric,0),0)
      on conflict(pay_group,month) do update set extra=excluded.extra,quality=excluded.quality;
    end loop;
    insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
      values(a.month,auth.uid(),'appeal_recalculated',jsonb_build_object('appeal_id',p_appeal_id,'snapshot_hash',v_hash,'comment',trim(coalesce(p_comment,''))));
  else
    update public.p4p_person_month_unlocks set status='closed',closed_at=now() where appeal_id=p_appeal_id and status='open';
  end if;
  update public.p4p_appeals set status='closed',review_comment=coalesce(nullif(trim(p_comment),''),review_comment),updated_at=now() where id=p_appeal_id;
  insert into public.p4p_appeal_audit(appeal_id,actor_id,event_type,details)
    values(p_appeal_id,auth.uid(),'closed',jsonb_build_object('comment',trim(coalesce(p_comment,'')),'recalculated',a.status in ('approved','editing','resubmitted')));
  return jsonb_build_object('ok',true,'appeal_id',p_appeal_id,'recalculated',a.status in ('approved','editing','resubmitted'),'snapshot_hash',v_hash);
end;
$$;
revoke all on function public.p4p_close_appeal(uuid,text) from public,anon;
grant execute on function public.p4p_close_appeal(uuid,text) to authenticated;
