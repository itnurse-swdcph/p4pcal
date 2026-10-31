-- Allow an administrator to restart a not-yet-closed review after a previously approved snapshot becomes stale.
create or replace function public.p4p_start_review(p_month date)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  m date:=date_trunc('month',p_month)::date;
  prev date:=(date_trunc('month',p_month)-interval '1 month')::date;
  res jsonb; snap_hash text; members uuid[]; member_count integer; chair_count integer;
  pending_count integer; old_status text; review_id uuid;
begin
  if auth.uid() is null or public.my_role()<>'admin' then raise exception 'เฉพาะผู้ดูแลระบบเริ่มกระบวนการรับรองได้'; end if;
  if exists(select 1 from public.p4p_closed_months where month=m) then raise exception 'งวดนี้ปิดแล้ว'; end if;
  if exists(select 1 from public.p4p_closed_months) and not exists(select 1 from public.p4p_closed_months where month=prev)
    and m>(select min(month) from public.p4p_closed_months) then raise exception 'ต้องปิดงวดเดือนก่อนหน้าก่อน'; end if;
  select count(*) into pending_count from public.v_logs where month=m and status='pending';
  if pending_count>0 then raise exception 'ยังมีรายการรอรับรอง % รายการ ต้องจัดการให้หมดก่อนเริ่มรับรองคะแนน',pending_count; end if;
  select coalesce(array_agg(user_id order by user_id),'{}'::uuid[]),count(*),count(*) filter(where is_chair)
  into members,member_count,chair_count
  from public.p4p_committee_members where active and user_id in(select user_id from public.profiles where role='committee');
  if member_count=0 then raise exception 'ยังไม่ได้กำหนดรายชื่อกรรมการ P4P'; end if;
  if chair_count<>1 then raise exception 'ต้องกำหนดประธานคณะกรรมการที่ปฏิบัติหน้าที่ให้ครบ 1 คน'; end if;
  select status into old_status from public.p4p_monthly_reviews where month=m for update;
  if old_status in ('reviewing','closed') then raise exception 'งวดนี้อยู่ระหว่างรับรองหรือปิดแล้ว ไม่สามารถเริ่มใหม่ได้'; end if;
  res:=public.p4p_calc(m); snap_hash:=md5(res::text);
  if coalesce((res #>> '{warnings,pending_rows}')::integer,0)>0 then raise exception 'พบรายการรอรับรองค้างอยู่ ไม่สามารถเริ่มรับรองได้'; end if;
  insert into public.p4p_monthly_reviews(month,status,snapshot,snapshot_hash,expected_members,pending_count,started_by,started_at,approved_at,chair_confirmed_by,chair_confirmed_at,updated_at)
  values(m,'reviewing',res,snap_hash,members,0,auth.uid(),now(),null,null,null,now())
  on conflict(month) do update set status='reviewing',snapshot=excluded.snapshot,snapshot_hash=excluded.snapshot_hash,
    expected_members=excluded.expected_members,pending_count=0,started_by=auth.uid(),started_at=now(),
    approved_at=null,chair_confirmed_by=null,chair_confirmed_at=null,updated_at=now()
  returning id into review_id;
  delete from public.p4p_monthly_review_votes where month=m;
  insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
  values(m,auth.uid(),'review_started',jsonb_build_object('review_id',review_id,'snapshot_hash',snap_hash,'committee_count',member_count,'pending_count',0));
  return jsonb_build_object('ok',true,'month',m,'status','reviewing','review_id',review_id,'snapshot_hash',snap_hash,'committee_count',member_count,'snapshot',res);
end;
$$;
