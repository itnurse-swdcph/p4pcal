-- P4P committee certification and chair-only period close.
-- Existing score and allocation formulas are preserved; only review controls and diagnostic fields are added.

create table if not exists public.p4p_committee_members (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  active boolean not null default true,
  is_chair boolean not null default false,
  appointed_at timestamptz not null default now(),
  appointed_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint p4p_committee_chair_must_be_active check (not is_chair or active)
);
create unique index if not exists p4p_one_active_chair on public.p4p_committee_members (is_chair) where active and is_chair;

create table if not exists public.p4p_monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,
  status text not null default 'reviewing' check (status in ('reviewing','approved','rejected','stale','closed','reopened')),
  snapshot jsonb not null,
  snapshot_hash text not null,
  expected_members uuid[] not null default '{}'::uuid[],
  pending_count integer not null default 0,
  started_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  approved_at timestamptz,
  chair_confirmed_by uuid references auth.users(id),
  chair_confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint p4p_review_month_first_day check (month = date_trunc('month', month)::date)
);
create table if not exists public.p4p_monthly_review_votes (
  month date not null references public.p4p_monthly_reviews(month) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  decision text not null check (decision in ('approved','rejected')),
  comment text,
  snapshot_hash text not null,
  voted_at timestamptz not null default now(),
  primary key (month,user_id)
);
create table if not exists public.p4p_monthly_review_events (
  id bigserial primary key,
  month date not null,
  actor_id uuid references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.p4p_closed_months
  add column if not exists review_id uuid references public.p4p_monthly_reviews(id),
  add column if not exists snapshot_hash text,
  add column if not exists chair_confirmed_by uuid references auth.users(id),
  add column if not exists chair_confirmed_at timestamptz;

alter table public.p4p_committee_members enable row level security;
alter table public.p4p_monthly_reviews enable row level security;
alter table public.p4p_monthly_review_votes enable row level security;
alter table public.p4p_monthly_review_events enable row level security;

revoke all on public.p4p_committee_members from anon,authenticated;
revoke all on public.p4p_monthly_reviews from anon,authenticated;
revoke all on public.p4p_monthly_review_votes from anon,authenticated;
revoke all on public.p4p_monthly_review_events from anon,authenticated;
grant select on public.p4p_committee_members to authenticated;
grant select on public.p4p_monthly_reviews to authenticated;
grant select on public.p4p_monthly_review_votes to authenticated;
grant select on public.p4p_monthly_review_events to authenticated;

create or replace function public.p4p_is_committee_member()
returns boolean language sql stable security definer set search_path=public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.p4p_committee_members m
    join public.profiles p on p.user_id=m.user_id
    where m.user_id=auth.uid() and m.active and p.role='committee'
  );
$$;
create or replace function public.p4p_is_committee_chair()
returns boolean language sql stable security definer set search_path=public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.p4p_committee_members m
    join public.profiles p on p.user_id=m.user_id
    where m.user_id=auth.uid() and m.active and m.is_chair and p.role='committee'
  );
$$;

drop policy if exists p4p_committee_members_read on public.p4p_committee_members;
drop policy if exists p4p_monthly_reviews_read on public.p4p_monthly_reviews;
drop policy if exists p4p_monthly_review_votes_read on public.p4p_monthly_review_votes;
drop policy if exists p4p_monthly_review_events_read on public.p4p_monthly_review_events;
create policy p4p_committee_members_read on public.p4p_committee_members for select to authenticated
using (public.my_role()='admin' or public.p4p_is_committee_member());
create policy p4p_monthly_reviews_read on public.p4p_monthly_reviews for select to authenticated
using (public.my_role()='admin' or public.p4p_is_committee_member());
create policy p4p_monthly_review_votes_read on public.p4p_monthly_review_votes for select to authenticated
using (public.my_role()='admin' or public.p4p_is_committee_member());
create policy p4p_monthly_review_events_read on public.p4p_monthly_review_events for select to authenticated
using (public.my_role()='admin' or public.p4p_is_committee_member());

drop policy if exists pcm_read on public.p4p_closed_months;
create policy pcm_read on public.p4p_closed_months for select to authenticated
using (public.my_role() in ('committee','admin') and
       (public.my_role()='admin' or public.p4p_is_committee_member()));

create or replace function public.p4p_set_committee_member(p_user_id uuid,p_active boolean,p_is_chair boolean default false)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare target_role text;
begin
  if auth.uid() is null or public.my_role()<>'admin' then raise exception 'เฉพาะผู้ดูแลระบบจัดการรายชื่อกรรมการได้'; end if;
  if p_user_id is null then raise exception 'กรุณาเลือกบัญชีกรรมการ'; end if;
  if p_is_chair and not p_active then raise exception 'ประธานต้องเป็นกรรมการที่ปฏิบัติหน้าที่'; end if;
  select role into target_role from public.profiles where user_id=p_user_id;
  if target_role is distinct from 'committee' then raise exception 'บัญชีที่เลือกต้องกำหนดสิทธิ์เป็นกรรมการ P4P ก่อน'; end if;
  if p_is_chair then
    update public.p4p_committee_members set is_chair=false,updated_at=now()
    where active and is_chair and user_id<>p_user_id;
  end if;
  insert into public.p4p_committee_members(user_id,active,is_chair,appointed_by,updated_at)
  values(p_user_id,p_active,p_is_chair,auth.uid(),now())
  on conflict(user_id) do update set active=excluded.active,is_chair=excluded.is_chair,
    appointed_by=case when excluded.active then auth.uid() else public.p4p_committee_members.appointed_by end,
    updated_at=now();
  return jsonb_build_object('ok',true,'user_id',p_user_id,'active',p_active,'is_chair',p_is_chair);
end;
$$;

create or replace function public.p4p_committee_calc(p_month date)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null or not (public.my_role()='admin' or
    (public.my_role()='committee' and public.p4p_is_committee_member())) then
    raise exception 'ไม่มีสิทธิ์ดูผลการคำนวณ P4P';
  end if;
  return public.p4p_calc(p_month);
end;
$$;

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

create or replace function public.p4p_review_vote(p_month date,p_decision text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  m date:=date_trunc('month',p_month)::date;
  r public.p4p_monthly_reviews%rowtype;
  res jsonb; current_hash text; current_members uuid[]; pending_count integer; vote_count integer; next_status text;
begin
  if auth.uid() is null or public.my_role()<>'committee' or not public.p4p_is_committee_member() then raise exception 'เฉพาะกรรมการที่ได้รับแต่งตั้งลงมติได้'; end if;
  if p_decision not in('approved','rejected') then raise exception 'ผลการลงมติไม่ถูกต้อง'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_comment,'')))<5 then raise exception 'กรุณาระบุเหตุผลที่ไม่เห็นชอบอย่างน้อย 5 ตัวอักษร'; end if;
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
  if exists(select 1 from public.p4p_monthly_review_votes where month=m and user_id=auth.uid()) then raise exception 'บัญชีนี้ลงมติในงวดนี้แล้ว'; end if;
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
    else next_status:='reviewing'; end if;
  end if;
  insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
  values(m,auth.uid(),'committee_vote',jsonb_build_object('decision',p_decision,'comment',nullif(trim(coalesce(p_comment,'')),''),'status',next_status));
  return jsonb_build_object('ok',true,'status',next_status,'decision',p_decision,
    'approved_votes',(select count(*) from public.p4p_monthly_review_votes where month=m and decision='approved'),
    'required_votes',cardinality(r.expected_members));
end;
$$;

create or replace function public.p4p_close(p_month date)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  m date:=date_trunc('month',p_month)::date;
  prev date:=(date_trunc('month',p_month)-interval '1 month')::date;
  r public.p4p_monthly_reviews%rowtype; res jsonb; current_hash text; current_members uuid[]; pending_count integer; gj jsonb;
begin
  if auth.uid() is null or public.my_role()<>'committee' or not public.p4p_is_committee_chair() then raise exception 'เฉพาะประธานคณะกรรมการ P4P ยืนยันปิดงวดได้'; end if;
  if exists(select 1 from public.p4p_closed_months where month=m) then raise exception 'งวดนี้ปิดแล้ว'; end if;
  select * into r from public.p4p_monthly_reviews where month=m for update;
  if not found or r.status<>'approved' then raise exception 'กรรมการทุกคนต้องอนุมัติก่อนประธานยืนยันปิดงวด'; end if;
  if exists(select 1 from public.p4p_closed_months) and not exists(select 1 from public.p4p_closed_months where month=prev)
    and m>(select min(month) from public.p4p_closed_months) then raise exception 'ต้องปิดงวดเดือนก่อนหน้าก่อน'; end if;
  select count(*) into pending_count from public.v_logs where month=m and status='pending';
  if pending_count>0 then raise exception 'ยังมีรายการรอรับรอง % รายการ ไม่สามารถปิดงวดได้',pending_count; end if;
  select coalesce(array_agg(user_id order by user_id),'{}'::uuid[]) into current_members
  from public.p4p_committee_members where active and user_id in(select user_id from public.profiles where role='committee');
  if current_members is distinct from r.expected_members then raise exception 'รายชื่อกรรมการเปลี่ยนแปลงหลังลงมติ กรุณาเริ่มรับรองใหม่'; end if;
  if (select count(*) from public.p4p_monthly_review_votes where month=m and decision='approved' and snapshot_hash=r.snapshot_hash)<>cardinality(r.expected_members)
    then raise exception 'ผลอนุมัติของกรรมการยังไม่ครบทุกคน'; end if;
  res:=public.p4p_calc(m); current_hash:=md5(res::text);
  if current_hash<>r.snapshot_hash then
    update public.p4p_monthly_reviews set status='stale',updated_at=now() where month=m;
    raise exception 'ข้อมูลคะแนนหรือการจัดสรรเปลี่ยนแปลงหลังกรรมการอนุมัติ กรุณาเริ่มรับรองใหม่';
  end if;
  res:=r.snapshot || jsonb_build_object('closed',true,'snapshot_hash',r.snapshot_hash,'review_id',r.id,'chair_confirmed_by',auth.uid(),'chair_confirmed_at',now());
  for gj in select * from jsonb_array_elements(res->'groups') loop
    insert into public.p4p_carry(pay_group,month,extra,quality)
    values((gj->>'pay_group')::integer,m,coalesce((gj->>'carry_extra_out')::numeric,0),0)
    on conflict(pay_group,month) do update set extra=excluded.extra,quality=excluded.quality;
  end loop;
  insert into public.p4p_closed_months(month,result,closed_by,closed_at,review_id,snapshot_hash,chair_confirmed_by,chair_confirmed_at)
  values(m,res,auth.uid(),now(),r.id,r.snapshot_hash,auth.uid(),now());
  update public.p4p_monthly_reviews set status='closed',chair_confirmed_by=auth.uid(),chair_confirmed_at=now(),updated_at=now() where month=m;
  insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
  values(m,auth.uid(),'period_closed',jsonb_build_object('review_id',r.id,'snapshot_hash',r.snapshot_hash));
  return res;
end;
$$;

drop function if exists public.p4p_reopen(date);
create or replace function public.p4p_reopen(p_month date,p_reason text)
returns void language plpgsql security definer set search_path=public
as $$
declare m date:=date_trunc('month',p_month)::date; old_result jsonb; old_closed_by uuid; old_closed_at timestamptz;
begin
  if auth.uid() is null or public.my_role()<>'admin' then raise exception 'เฉพาะผู้ดูแลระบบเปิดงวดได้'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'กรุณาระบุเหตุผลการเปิดงวดอย่างน้อย 5 ตัวอักษร'; end if;
  if exists(select 1 from public.p4p_closed_months where month>m) then raise exception 'ต้องเปิดงวดของเดือนหลังก่อน'; end if;
  select result,closed_by,closed_at into old_result,old_closed_by,old_closed_at from public.p4p_closed_months where month=m;
  if old_result is null then raise exception 'ไม่พบงวดที่ปิดแล้ว'; end if;
  insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
  values(m,auth.uid(),'period_reopened',jsonb_build_object('reason',trim(p_reason),'previous_result',old_result,'previous_closed_by',old_closed_by,'previous_closed_at',old_closed_at));
  delete from public.p4p_carry where month=m;
  delete from public.p4p_closed_months where month=m;
  update public.p4p_monthly_reviews set status='reopened',chair_confirmed_by=null,chair_confirmed_at=null,updated_at=now() where month=m;
end;
$$;

create or replace function public.p4p_my_payout(p_month date)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  m date:=date_trunc('month',p_month)::date;
  closed_result jsonb; person_id uuid; line_data jsonb; group_data jsonb;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select result into closed_result from public.p4p_closed_months where month=m;
  if closed_result is null then return jsonb_build_object('closed',false,'payout_available',false); end if;
  select id into person_id from public.people where user_id=auth.uid() and coalesce(active,true) order by id limit 1;
  if person_id is null then return jsonb_build_object('closed',true,'payout_available',false); end if;
  select v into line_data from jsonb_array_elements(coalesce(closed_result->'lines','[]'::jsonb)) v where v->>'id'=person_id::text limit 1;
  if line_data is null then return jsonb_build_object('closed',true,'payout_available',false); end if;
  select g into group_data from jsonb_array_elements(coalesce(closed_result->'groups','[]'::jsonb)) g
  where (g->>'pay_group')::integer=(line_data->>'pay_group')::integer limit 1;
  return jsonb_build_object('closed',true,'payout_available',true,'pay_group',line_data->'pay_group',
    'base_amount',coalesce(line_data->'activity','0'::jsonb),'extra_amount',coalesce(line_data->'extra','0'::jsonb),
    'total_amount',coalesce(line_data->'total','0'::jsonb),'rate_per_point',coalesce(group_data->'rate_per_point','0'::jsonb),
    'snapshot_hash',closed_result->'snapshot_hash');
end;
$$;

create or replace function public.p4p_alloc(g public.pay_groups,persons jsonb,carry_extra numeric default 0,carry_q numeric default 0)
returns jsonb language plpgsql immutable
as $$
declare
  q numeric:=0; a numeric; r numeric; s numeric; cap numeric; n_el int; n_in int; n_below int;
  sum_ex numeric; pool_x numeric; carry_x_out numeric; below_difference numeric; lines jsonb;
begin
  a:=g.full_amount; r:=round(a*3/100,2); s:=a-r;
  select count(*) filter(where el),count(*) filter(where not el),
    count(*) filter(where el and least(pts,person_cap)<person_guarantee),
    coalesce(sum(greatest(0,least(pts,person_cap)-person_guarantee)) filter(where el),0)
  into n_el,n_in,n_below,sum_ex
  from (
    select coalesce((e->>'eligible')::boolean,true) el,coalesce((e->>'points')::numeric,0) pts,
      coalesce((e->>'guarantee')::numeric,g.guarantee) person_guarantee,
      coalesce((e->>'cap')::numeric,g.guarantee*g.cap_mult) person_cap
    from jsonb_array_elements(persons) e
  ) p;
  below_difference:=(s-round(g.full_amount*0.77,2))*n_below;
  pool_x:=coalesce(carry_extra,0)+round(r*n_el,2)+below_difference+g.full_amount*n_in;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'eligible',el,'points',pts,'counted',cnt,
    'quality_pass',true,'quality',0,'activity',aa,'extra',xa,'total',aa+xa) order by ord),'[]'::jsonb)
  into lines
  from (
    select id,el,pts,cnt,ord,
      case when el then case when cnt<person_guarantee then round(g.full_amount*0.77,2) else s end else 0 end aa,
      case when el and sum_ex>0 then trunc(greatest(0,cnt-person_guarantee)*pool_x/sum_ex,2) else 0 end xa
    from (
      select e->>'id' id,coalesce((e->>'eligible')::boolean,true) el,coalesce((e->>'points')::numeric,0) pts,
        coalesce((e->>'guarantee')::numeric,g.guarantee) person_guarantee,
        case when coalesce((e->>'eligible')::boolean,true)
          then least(coalesce((e->>'points')::numeric,0),coalesce((e->>'cap')::numeric,g.guarantee*g.cap_mult)) else 0 end cnt,
        ord
      from jsonb_array_elements(persons) with ordinality t(e,ord)
    ) b
  ) c;
  carry_x_out:=pool_x-coalesce((select sum((l->>'extra')::numeric) from jsonb_array_elements(lines) l),0);
  return jsonb_build_object('quality_part',0,'activity_part',s,'reserve',r,'by_score',s,
    'fixed',round(g.full_amount*0.77,2),'quality_fail_part',round(g.full_amount*0.77,2),
    'cap',g.guarantee*g.cap_mult,'n_eligible',n_el,'n_ineligible',n_in,'n_below',n_below,
    'below_threshold_difference',round(below_difference,2),'pool_extra',pool_x,'sum_excess',sum_ex,
    'rate_per_point',case when sum_ex>0 then round(pool_x/sum_ex,6) else 0 end,
    'carry_extra_out',carry_x_out,'pool_quality',0,'quality_share',0,'carry_quality_out',0,'lines',lines);
end;
$$;

revoke execute on function public.p4p_calc(date) from public,anon,authenticated;
grant execute on function public.p4p_calc(date) to service_role;
revoke execute on function public.p4p_is_committee_member() from public,anon;
revoke execute on function public.p4p_is_committee_chair() from public,anon;
revoke execute on function public.p4p_set_committee_member(uuid,boolean,boolean) from public,anon;
revoke execute on function public.p4p_committee_calc(date) from public,anon;
revoke execute on function public.p4p_start_review(date) from public,anon;
revoke execute on function public.p4p_review_vote(date,text,text) from public,anon;
revoke execute on function public.p4p_close(date) from public,anon;
revoke execute on function public.p4p_reopen(date,text) from public,anon;
revoke execute on function public.p4p_my_payout(date) from public,anon;
grant execute on function public.p4p_is_committee_member() to authenticated;
grant execute on function public.p4p_is_committee_chair() to authenticated;
grant execute on function public.p4p_set_committee_member(uuid,boolean,boolean) to authenticated;
grant execute on function public.p4p_committee_calc(date) to authenticated;
grant execute on function public.p4p_start_review(date) to authenticated;
grant execute on function public.p4p_review_vote(date,text,text) to authenticated;
grant execute on function public.p4p_close(date) to authenticated;
grant execute on function public.p4p_reopen(date,text) to authenticated;
grant execute on function public.p4p_my_payout(date) to authenticated;
