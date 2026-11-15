create or replace function public.p4p_fund_requests_list(p_month date)
returns table (
  id uuid, month date, staff_directory_id integer, unit_id integer, unit_name text,
  staff_name text, requested_amount numeric, approved_amount numeric, reason text,
  status text, request_by uuid, request_at timestamptz, reviewed_by uuid,
  reviewed_at timestamptz, review_comment text
)
language plpgsql security definer set search_path=public
as $$
declare v_role text:=public.my_role(); v_username text;
begin
  select username into v_username from public.profiles where user_id=auth.uid();
  if auth.uid() is null or v_role not in ('admin','committee','head') then
    raise exception 'ไม่มีสิทธิ์ดูคำขอใช้เงินผู้ไม่มีสิทธิ์';
  end if;
  return query
  select q.id,q.month,q.staff_directory_id,q.unit_id,u.name,
    coalesce(p.name,trim(d.prefix)||trim(d.first_name)||' '||trim(d.last_name)),
    q.requested_amount,q.approved_amount,q.reason,q.status,q.request_by,q.request_at,
    q.reviewed_by,q.reviewed_at,q.review_comment
  from public.p4p_ineligible_fund_requests q
  join public.units u on u.id=q.unit_id
  left join public.staff_directory d on d.source_row=q.staff_directory_id
  left join public.people p on p.staff_directory_id=q.staff_directory_id
  where q.month=date_trunc('month',p_month)::date
    and (
      (v_role in ('admin','committee') and (v_role<>'admin' or v_username='11450'))
      or q.unit_id in (select public.my_units())
    )
  order by q.request_at desc;
end $$;

create or replace function public.p4p_fund_request_create(
  p_month date,p_staff_directory_id integer,p_unit_id integer,p_amount numeric,p_reason text
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_role text:=public.my_role();
  v_username text;
  v_calc jsonb;
  v_available numeric:=0;
  v_reserved numeric:=0;
  v_id uuid;
begin
  select username into v_username from public.profiles where user_id=auth.uid();
  if auth.uid() is null or v_role not in ('admin','head') then
    raise exception 'เฉพาะหัวหน้างาน/หัวหน้ากลุ่มงาน หรือแอดมินกลางที่ส่งคำขอได้';
  end if;
  if v_role='admin' and v_username<>'11450' then raise exception 'เฉพาะแอดมินกลาง 11450 ที่ส่งคำขอแทนหน่วยงานได้'; end if;
  if v_role='head' and p_unit_id not in (select public.my_units()) then
    raise exception 'ไม่มีสิทธิ์ส่งคำขอแทนหน่วยงานนี้';
  end if;
  if p_amount is null or p_amount<=0 or coalesce(length(trim(p_reason)),0)=0 then
    raise exception 'กรุณาระบุจำนวนเงินและเหตุผลให้ครบ';
  end if;
  if public.p4p_month_is_closed(p_month) then raise exception 'งวดนี้ปิดแล้ว ไม่สามารถส่งคำขอได้'; end if;

  v_calc:=public.p4p_calc(date_trunc('month',p_month)::date);
  select coalesce((x->>'ineligible_amount')::numeric,0) into v_available
  from jsonb_array_elements(coalesce(v_calc->'lines','[]'::jsonb)) x
  where (x->>'staff_directory_id')::integer=p_staff_directory_id
    and (x->>'unit_id')::integer=p_unit_id
    and coalesce((x->>'eligible')::boolean,false)=false
  limit 1;
  if coalesce(v_available,0)<=0 then
    raise exception 'ไม่พบยอดเงินผู้ไม่มีสิทธิ์ของบุคลากรรายนี้ในหน่วยงานและเดือนที่เลือก';
  end if;
  select coalesce(sum(case when status='approved' then approved_amount
                           when status='pending' then requested_amount else 0 end),0)
  into v_reserved
  from public.p4p_ineligible_fund_requests
  where month=date_trunc('month',p_month)::date and staff_directory_id=p_staff_directory_id;
  if trunc(p_amount,2)>trunc(v_available-v_reserved,2) then
    raise exception 'จำนวนเงินที่ขอเกินยอดคงเหลือที่ยังไม่ถูกจอง (คงเหลือ % บาท)',trunc(v_available-v_reserved,2);
  end if;
  insert into public.p4p_ineligible_fund_requests(month,staff_directory_id,unit_id,requested_amount,reason,request_by)
  values(date_trunc('month',p_month)::date,p_staff_directory_id,p_unit_id,trunc(p_amount,2),trim(p_reason),auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.p4p_fund_request_decide(
  p_request_id uuid,p_decision text,p_approved_amount numeric default null,p_comment text default null
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  q public.p4p_ineligible_fund_requests%rowtype;
  v_username text;
  v_calc jsonb;
  v_available numeric:=0;
  v_reserved numeric:=0;
  v_approved numeric;
begin
  select username into v_username from public.profiles where user_id=auth.uid();
  if auth.uid() is null or not (
    (public.my_role()='admin' and v_username='11450') or public.p4p_is_committee_member()
  ) then raise exception 'เฉพาะแอดมินกลาง 11450 หรือกรรมการ P4P ที่อนุมัติคำขอได้'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'สถานะการพิจารณาไม่ถูกต้อง'; end if;
  select * into q from public.p4p_ineligible_fund_requests where id=p_request_id for update;
  if not found then raise exception 'ไม่พบคำขอ'; end if;
  if q.status<>'pending' then raise exception 'คำขอนี้ได้รับการพิจารณาแล้ว'; end if;
  if public.p4p_month_is_closed(q.month) then raise exception 'งวดนี้ปิดแล้ว ไม่สามารถแก้ไขคำขอได้'; end if;

  if p_decision='approved' then
    v_approved:=trunc(coalesce(p_approved_amount,q.requested_amount),2);
    if v_approved<=0 or v_approved>q.requested_amount then raise exception 'ยอดอนุมัติต้องมากกว่า 0 และไม่เกินยอดที่ขอ'; end if;
    v_calc:=public.p4p_calc(q.month);
    select coalesce((x->>'ineligible_amount')::numeric,0) into v_available
    from jsonb_array_elements(coalesce(v_calc->'lines','[]'::jsonb)) x
    where (x->>'staff_directory_id')::integer=q.staff_directory_id
      and (x->>'unit_id')::integer=q.unit_id
      and coalesce((x->>'eligible')::boolean,false)=false limit 1;
    select coalesce(sum(case when status='approved' then approved_amount
                             when status='pending' and id<>q.id then requested_amount else 0 end),0)
    into v_reserved
    from public.p4p_ineligible_fund_requests
    where month=q.month and staff_directory_id=q.staff_directory_id;
    if v_approved+v_reserved>coalesce(v_available,0) then
      raise exception 'ยอดอนุมัติรวมคำขออื่นเกินเงินผู้ไม่มีสิทธิ์คงเหลือ % บาท',trunc(coalesce(v_available,0)-v_reserved,2);
    end if;
    update public.p4p_ineligible_fund_requests
    set status='approved',approved_amount=v_approved,reviewed_by=auth.uid(),reviewed_at=now(),
        review_comment=nullif(trim(coalesce(p_comment,'')),'')
    where id=q.id;
  else
    update public.p4p_ineligible_fund_requests
    set status='rejected',approved_amount=0,reviewed_by=auth.uid(),reviewed_at=now(),
        review_comment=nullif(trim(coalesce(p_comment,'')),'')
    where id=q.id;
  end if;
  update public.p4p_monthly_reviews set status='stale',updated_at=now()
  where month=q.month and status in ('approved','in_review');
end $$;

grant execute on function public.p4p_fund_requests_list(date) to authenticated;
grant execute on function public.p4p_fund_request_create(date,integer,integer,numeric,text) to authenticated;
grant execute on function public.p4p_fund_request_decide(uuid,text,numeric,text) to authenticated;