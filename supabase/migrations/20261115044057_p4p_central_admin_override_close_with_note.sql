alter table public.p4p_monthly_reviews add column if not exists admin_note text;
alter table public.p4p_closed_months add column if not exists admin_note text;

create or replace function public.p4p_admin_close_month(p_month date, p_note text)
returns jsonb language plpgsql security definer
set search_path = public, auth
as $function$
declare
  m date := date_trunc('month', p_month)::date;
  prev date := (date_trunc('month', p_month) - interval '1 month')::date;
  v_profile public.profiles%rowtype;
  v_note text := trim(coalesce(p_note, ''));
  res jsonb; snap_hash text; pending_count integer; gj jsonb; review_id uuid; nm text;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select * into v_profile from public.profiles where user_id = auth.uid();
  if not found or v_profile.role <> 'admin' or trim(coalesce(v_profile.username,'')) <> '11450' then
    raise exception 'อนุญาตเฉพาะแอดมินกลางบัญชี 11450 เท่านั้น';
  end if;
  if p_month is null or date_trunc('month',p_month)::date <> p_month then raise exception 'ระบุเดือนในรูปแบบวันแรกของเดือน'; end if;
  if length(v_note) < 5 then raise exception 'กรุณาระบุหมายเหตุการอนุมัติและปิดยอดอย่างน้อย 5 ตัวอักษร'; end if;
  if exists(select 1 from public.p4p_closed_months where month=m) then raise exception 'งวดนี้ปิดแล้ว'; end if;
  if exists(select 1 from public.p4p_closed_months) and not exists(select 1 from public.p4p_closed_months where month=prev)
     and m > (select min(month) from public.p4p_closed_months) then raise exception 'ต้องปิดงวดเดือนก่อนหน้าก่อน'; end if;

  select count(*) into pending_count from public.v_logs where month=m and status='pending';
  if pending_count > 0 then raise exception 'ยังมีรายการรอรับรอง % รายการ ไม่สามารถปิดงวดได้', pending_count; end if;

  -- แอดมินกลางแทนกรรมการได้: ตรวจว่าทุกหน่วยงานส่งผลงานครบ โดยไม่ต้องรอสถานะตรวจจากกรรมการ
  if exists (
    select 1 from public.units u
    where exists(select 1 from public.staff_directory d where d.active is true and trim(d.unit_name)=trim(u.name))
      and not exists(select 1 from public.p4p_month_submissions s
        where s.month=m and s.scope_type='unit' and s.unit_id=u.id and s.status in ('submitted','resubmitted','reviewed'))
  ) then raise exception 'ยังมีหน่วยงานที่ไม่ได้ส่งผลงานครบ'; end if;
  if exists (
    select 1 from (
      select distinct trim(d.nursing_group) group_name from public.staff_directory d
      where d.active is true and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
        and nullif(trim(d.nursing_group),'') is not null
    ) g
    where not exists(select 1 from public.p4p_month_submissions s
      where s.month=m and s.scope_type='group' and trim(s.group_name)=g.group_name and s.status in ('submitted','resubmitted','reviewed'))
  ) then raise exception 'ยังมีกลุ่มงานที่มีหัวหน้ากลุ่มงานไม่ได้ส่งผลงานครบ'; end if;

  if exists(select 1 from public.p4p_month_submissions s
    join public.p4p_submission_returns r on r.submission_id=s.id
    where s.month=m and r.status='returned') then
    raise exception 'ยังมีรายการส่งผลงานที่ถูกส่งกลับและยังไม่ได้แก้ไข/ส่งใหม่';
  end if;
  if exists(select 1 from public.p4p_person_month_unlocks u
    join public.logs l on l.person_id=u.person_id
    where u.status='open' and l.status in ('draft','rejected')
      and l.work_date >= m and l.work_date < (m + interval '1 month')::date) then
    raise exception 'ยังมีกิจกรรมเพิ่มเติมที่เปิดสิทธิ์ไว้แต่ยังไม่ได้ส่งรับรอง';
  end if;

  res := public.p4p_calc(m);
  if coalesce((res #>> '{warnings,pending_rows}')::integer,0) > 0 then raise exception 'พบรายการรอรับรองค้างอยู่ ไม่สามารถปิดงวดได้'; end if;
  snap_hash := md5(res::text);
  select coalesce(nullif(trim(full_name),''), username) into nm from public.profiles where user_id=auth.uid();

  delete from public.p4p_monthly_review_votes where month=m;
  insert into public.p4p_monthly_reviews(month,status,snapshot,snapshot_hash,expected_members,pending_count,
    started_by,started_at,approved_at,chair_confirmed_by,chair_confirmed_at,admin_note,updated_at)
  values(m,'closed',res,snap_hash,'{}'::uuid[],0,auth.uid(),now(),now(),auth.uid(),now(),v_note,now())
  on conflict(month) do update set status='closed',snapshot=excluded.snapshot,snapshot_hash=excluded.snapshot_hash,
    expected_members='{}'::uuid[],pending_count=0,started_by=auth.uid(),started_at=now(),
    approved_at=now(),chair_confirmed_by=auth.uid(),chair_confirmed_at=now(),admin_note=v_note,updated_at=now()
  returning id into review_id;

  res := res || jsonb_build_object('closed',true,'snapshot_hash',snap_hash,'review_id',review_id,
    'closed_by',auth.uid(),'closed_by_name',nm,'closed_at',now(),'admin_override',true,'admin_note',v_note);
  for gj in select * from jsonb_array_elements(res->'groups') loop
    insert into public.p4p_carry(pay_group,month,extra,quality)
    values((gj->>'pay_group')::integer,m,coalesce((gj->>'carry_extra_out')::numeric,0),0)
    on conflict(pay_group,month) do update set extra=excluded.extra,quality=excluded.quality;
  end loop;
  insert into public.p4p_closed_months(month,result,closed_by,closed_at,review_id,snapshot_hash,chair_confirmed_by,chair_confirmed_at,admin_note)
  values(m,res,auth.uid(),now(),review_id,snap_hash,auth.uid(),now(),v_note);
  insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
  values(m,auth.uid(),'admin_override_closed',jsonb_build_object('review_id',review_id,'snapshot_hash',snap_hash,
    'admin_note',v_note,'closed_by_name',nm,'bypassed_committee_votes',true,'bypassed_unit_committee_reviews',true));
  return res;
end;
$function$;

revoke execute on function public.p4p_admin_close_month(date,text) from public, anon;
grant execute on function public.p4p_admin_close_month(date,text) to authenticated;
