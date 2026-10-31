-- Require a meaningful reason for a committee rejection; enforce this in the database as well as the UI.
create or replace function public.p4p_review_vote(p_month date,p_decision text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  m date:=date_trunc('month',p_month)::date;
  r public.p4p_monthly_reviews%rowtype;
  res jsonb; current_hash text; current_members uuid[]; pending_count integer; vote_count integer; next_status text;
begin
  if auth.uid() is null or public.my_role()<>'committee' or not public.p4p_is_committee_member() then
    raise exception 'เฉพาะกรรมการที่ได้รับแต่งตั้งลงมติได้';
  end if;
  if p_decision not in('approved','rejected') then raise exception 'ผลการลงมติไม่ถูกต้อง'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_comment,'')))<5 then
    raise exception 'กรุณาระบุเหตุผลที่ไม่เห็นชอบอย่างน้อย 5 ตัวอักษร';
  end if;

  select * into r from public.p4p_monthly_reviews where month=m for update;
  if not found or r.status<>'reviewing' then raise exception 'งวดนี้ไม่ได้อยู่ในขั้นตอนรอกรรมการลงมติ'; end if;
  if not(auth.uid()=any(r.expected_members)) then raise exception 'บัญชีนี้ไม่ได้อยู่ในรายชื่อกรรมการของงวดนี้'; end if;

  select coalesce(array_agg(user_id order by user_id),'{}'::uuid[]) into current_members
  from public.p4p_committee_members where active and user_id in(select user_id from public.profiles where role='committee');
  if current_members is distinct from r.expected_members then
    update public.p4p_monthly_reviews set status='stale',updated_at=now() where month=m;
    delete from public.p4p_monthly_review_votes where month=m;
    insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
    values(m,auth.uid(),'committee_roster_changed',jsonb_build_object('expected_members',r.expected_members,'current_members',current_members));
    return jsonb_build_object('ok',false,'status','stale','reason','committee_roster_changed');
  end if;

  select count(*) into pending_count from public.v_logs where month=m and status='pending';
  if pending_count>0 then
    update public.p4p_monthly_reviews set status='stale',pending_count=pending_count,updated_at=now() where month=m;
    delete from public.p4p_monthly_review_votes where month=m;
    insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
    values(m,auth.uid(),'pending_items_detected',jsonb_build_object('pending_count',pending_count));
    return jsonb_build_object('ok',false,'status','stale','reason','pending_items','pending_count',pending_count);
  end if;

  res:=public.p4p_calc(m); current_hash:=md5(res::text);
  if current_hash<>r.snapshot_hash then
    update public.p4p_monthly_reviews set status='stale',updated_at=now() where month=m;
    delete from public.p4p_monthly_review_votes where month=m;
    insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
    values(m,auth.uid(),'snapshot_changed',jsonb_build_object('old_hash',r.snapshot_hash,'new_hash',current_hash));
    return jsonb_build_object('ok',false,'status','stale','reason','snapshot_changed');
  end if;

  if exists(select 1 from public.p4p_monthly_review_votes where month=m and user_id=auth.uid()) then
    raise exception 'บัญชีนี้ลงมติในงวดนี้แล้ว';
  end if;
  insert into public.p4p_monthly_review_votes(month,user_id,decision,comment,snapshot_hash)
  values(m,auth.uid(),p_decision,nullif(trim(coalesce(p_comment,'')),''),r.snapshot_hash);

  if p_decision='rejected' then
    next_status:='rejected';
    update public.p4p_monthly_reviews set status=next_status,updated_at=now() where month=m;
  else
    select count(*) into vote_count from public.p4p_monthly_review_votes
    where month=m and decision='approved' and snapshot_hash=r.snapshot_hash;
    if vote_count=cardinality(r.expected_members) then
      next_status:='approved';
      update public.p4p_monthly_reviews set status=next_status,approved_at=now(),updated_at=now() where month=m;
    else
      next_status:='reviewing';
    end if;
  end if;

  insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
  values(m,auth.uid(),'committee_vote',jsonb_build_object('decision',p_decision,'comment',nullif(trim(coalesce(p_comment,'')),''),'status',next_status));

  return jsonb_build_object('ok',true,'status',next_status,'decision',p_decision,
    'approved_votes',(select count(*) from public.p4p_monthly_review_votes where month=m and decision='approved'),
    'required_votes',cardinality(r.expected_members));
end;
$$;
revoke execute on function public.p4p_review_vote(date,text,text) from public,anon;
grant execute on function public.p4p_review_vote(date,text,text) to authenticated;
