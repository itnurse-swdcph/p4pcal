alter table public.p4p_ineligible_fund_requests
  drop constraint if exists p4p_ineligible_fund_requests_status_check;
alter table public.p4p_ineligible_fund_requests
  add constraint p4p_ineligible_fund_requests_status_check
  check (status = any (array['pending'::text,'approved'::text,'rejected'::text,'cancelled'::text]));
alter table public.p4p_ineligible_fund_requests
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

create or replace function public.p4p_fund_request_cancel(p_request_id uuid,p_reason text default 'ยกเลิกคำขออนุมัติตามคำสั่งผู้ดูแลระบบ')
returns void language plpgsql security definer set search_path=public as $function$
declare q public.p4p_ineligible_fund_requests%rowtype; v_username text;
begin
  select username into v_username from public.profiles where user_id=auth.uid();
  if auth.uid() is null or not ((public.my_role()='admin' and v_username='11450') or public.p4p_is_committee_member()) then
    raise exception 'เฉพาะแอดมินกลาง 11450 หรือกรรมการ P4P เท่านั้นที่ยกเลิกคำขอได้';
  end if;
  select * into q from public.p4p_ineligible_fund_requests where id=p_request_id for update;
  if not found then raise exception 'ไม่พบคำขอ'; end if;
  if q.status<>'approved' then raise exception 'ยกเลิกได้เฉพาะรายการที่อนุมัติแล้ว'; end if;
  if public.p4p_month_is_closed(q.month) then raise exception 'งวดนี้ปิดแล้ว ไม่สามารถยกเลิกได้'; end if;
  update public.p4p_ineligible_fund_requests set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),cancellation_reason=nullif(trim(coalesce(p_reason,'')),'') where id=q.id;
  update public.p4p_monthly_reviews set status='stale',updated_at=now() where month=q.month and status in ('approved','in_review');
end $function$;
revoke all on function public.p4p_fund_request_cancel(uuid,text) from public,anon;
grant execute on function public.p4p_fund_request_cancel(uuid,text) to authenticated;

update public.p4p_ineligible_fund_requests
set status='cancelled',cancelled_by=reviewed_by,cancelled_at=now(),
    cancellation_reason='ยกเลิกรายการตามคำขอของผู้ดูแลระบบเมื่อ 15 พฤศจิกายน 2569'
where id='97639c3f-18e1-48e5-8f0d-72dd8c21ccd3' and status='approved' and month=date '2026-10-01';

drop function if exists public.p4p_fund_requests_list(date);
create function public.p4p_fund_requests_list(p_month date)
returns table(id uuid,month date,staff_directory_id integer,unit_id integer,unit_name text,staff_name text,
 requested_amount numeric,approved_amount numeric,reason text,status text,request_by uuid,request_at timestamptz,
 reviewed_by uuid,reviewed_at timestamptz,review_comment text,cancellation_reason text)
language plpgsql security definer set search_path=public as $function$
declare v_role text:=public.my_role(); v_username text;
begin
 select username into v_username from public.profiles where user_id=auth.uid();
 if auth.uid() is null or v_role not in ('admin','committee','head') then raise exception 'ไม่มีสิทธิ์ดูคำขอใช้เงินผู้ไม่มีสิทธิ์'; end if;
 return query select q.id,q.month,q.staff_directory_id,q.unit_id,u.name,
  coalesce(p.name,trim(d.prefix)||trim(d.first_name)||' '||trim(d.last_name)),
  q.requested_amount,q.approved_amount,q.reason,q.status,q.request_by,q.request_at,q.reviewed_by,q.reviewed_at,q.review_comment,q.cancellation_reason
 from public.p4p_ineligible_fund_requests q join public.units u on u.id=q.unit_id
 left join public.staff_directory d on d.source_row=q.staff_directory_id left join public.people p on p.staff_directory_id=q.staff_directory_id
 where q.month=date_trunc('month',p_month)::date and ((v_role in ('admin','committee') and (v_role<>'admin' or v_username='11450')) or q.unit_id in (select public.my_units()))
 order by q.request_at desc;
end $function$;
revoke all on function public.p4p_fund_requests_list(date) from public,anon;
grant execute on function public.p4p_fund_requests_list(date) to authenticated;