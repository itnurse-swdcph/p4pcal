create table if not exists public.p4p_person_month_unlocks (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null references public.p4p_month_submissions(id) on delete cascade,
 staff_directory_id integer not null, person_id uuid not null references public.people(id),
 month date not null, purpose text not null default 'additional_activity' check (purpose='additional_activity'),
 reason text not null, status text not null default 'open' check (status in ('open','closed')),
 opened_by uuid not null default auth.uid(), opened_at timestamptz not null default now(), closed_at timestamptz
);
create unique index if not exists p4p_person_month_unlocks_one_open on public.p4p_person_month_unlocks(submission_id,staff_directory_id) where status='open';
alter table public.p4p_person_month_unlocks enable row level security;
revoke all on public.p4p_person_month_unlocks from anon,authenticated;

create or replace function public.p4p_open_person_additional_activity(p_submission_id uuid,p_staff_directory_id integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare s public.p4p_month_submissions%rowtype; v_person uuid; v_unlock uuid; v_owner uuid;
begin
 if auth.uid() is null or not public.p4p_can_act_as_committee() then raise exception 'เฉพาะกรรมการ P4P ที่ปฏิบัติหน้าที่เท่านั้นที่เปิดสิทธิ์บันทึกเพิ่มได้'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'; end if;
 select * into s from public.p4p_month_submissions where id=p_submission_id for update;
 if not found or s.status not in ('submitted','resubmitted','returned') then raise exception 'ไม่พบผลงานที่ส่งแล้วหรือสถานะไม่อนุญาตให้เปิดสิทธิ์'; end if;
 if exists(select 1 from public.p4p_closed_months where month=s.month) or exists(select 1 from public.p4p_monthly_reviews where month=s.month and status in ('reviewing','approved','closed')) then raise exception 'เดือนนี้เริ่มรับรองผลหรือปิดงวดแล้ว ไม่สามารถเปิดสิทธิ์บันทึกเพิ่มได้'; end if;
 if s.scope_type='unit' then
  if not exists(select 1 from public.staff_directory d join public.units u on trim(u.name)=trim(d.unit_name) where d.source_row=p_staff_directory_id and d.active=true and u.id=s.unit_id) then raise exception 'บุคลากรไม่ได้อยู่ในหน่วยงานที่ส่งผลงาน'; end if;
 else
  if not exists(select 1 from public.staff_directory d where d.source_row=p_staff_directory_id and d.active=true and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
   and (trim(coalesce(d.nursing_group,''))=s.group_name or s.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]')))) then raise exception 'บุคลากรไม่ได้อยู่ในรายการระดับกลุ่มงานนี้'; end if;
 end if;
 select id,user_id into v_person,v_owner from public.people where staff_directory_id=p_staff_directory_id and active=true limit 1;
 if v_person is null then raise exception 'บุคลากรรายนี้ยังไม่มีบัญชีผู้ใช้สำหรับบันทึกกิจกรรม'; end if;
 insert into public.p4p_person_month_unlocks(submission_id,staff_directory_id,person_id,month,reason,opened_by)
 values(p_submission_id,p_staff_directory_id,v_person,s.month,trim(p_reason),auth.uid())
 on conflict(submission_id,staff_directory_id) where status='open'
 do update set reason=excluded.reason,opened_by=excluded.opened_by,opened_at=now() returning id into v_unlock;
 if v_owner is not null then insert into public.p4p_user_notifications(user_id,title,body,entity_type,entity_id) values(v_owner,'อนุญาตให้บันทึกกิจกรรม P4P เพิ่มเติม',trim(p_reason),'p4p_submission',null); end if;
 insert into public.p4p_submission_events(submission_id,event_type,actor_id,staff_directory_id,details) values(p_submission_id,'additional_activity_unlocked',auth.uid(),p_staff_directory_id,jsonb_build_object('reason',trim(p_reason),'unlock_id',v_unlock));
 return jsonb_build_object('ok',true,'unlock_id',v_unlock,'staff_directory_id',p_staff_directory_id);
end;$function$;
revoke all on function public.p4p_open_person_additional_activity(uuid,integer,text) from public;
grant execute on function public.p4p_open_person_additional_activity(uuid,integer,text) to authenticated;

create or replace function public.guard_p4p_submission_lock()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_person uuid; v_month date; v_sd integer; v_locked boolean; v_allowed boolean; v_allowed_additional boolean;
begin
 if tg_op='UPDATE' and coalesce(current_setting('p4p.committee_audit',true),'')=old.id::text and old.status='approved' and new.status in ('pending','draft')
  and old.person_id is not distinct from new.person_id and old.work_date is not distinct from new.work_date and old.activity_code is not distinct from new.activity_code and old.qty is not distinct from new.qty then return new; end if;
 if tg_op in ('UPDATE','DELETE') and old.status='pending' and length(trim(coalesce(old.reject_reason,'')))>0 and public.p4p_log_is_returned_for_correction(old.id)
  and (tg_op='DELETE' or (new.status='pending' and old.person_id is not distinct from new.person_id and date_trunc('month',old.work_date)::date is not distinct from date_trunc('month',new.work_date)::date)) then
  if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_op='UPDATE' and (old.person_id is distinct from new.person_id or date_trunc('month',old.work_date)::date is distinct from date_trunc('month',new.work_date)::date) then
  if public.p4p_is_submission_locked(old.person_id,date_trunc('month',old.work_date)::date) or public.p4p_is_submission_locked(new.person_id,date_trunc('month',new.work_date)::date) then raise exception 'ไม่สามารถย้ายกิจกรรมไปยังบุคลากรหรือเดือนอื่นหลังส่งผลงานแล้ว'; end if; end if;
 if tg_op='DELETE' then v_person:=old.person_id; v_month:=date_trunc('month',old.work_date)::date; else v_person:=new.person_id; v_month:=date_trunc('month',new.work_date)::date; end if;
 select p.staff_directory_id into v_sd from public.people p where p.id=v_person;
 select exists(select 1 from public.p4p_month_submissions s where s.month=v_month and s.status in ('submitted','returned','resubmitted','reviewed')
  and ((s.scope_type='unit' and s.unit_id=(select unit_id from public.people where id=v_person))
   or (s.scope_type='group' and exists(select 1 from public.staff_directory d where d.source_row=v_sd and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%' and (trim(coalesce(d.nursing_group,''))=s.group_name or s.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]'))))))) into v_locked;
 if not v_locked then if tg_op='DELETE' then return old; else return new; end if; end if;
 select exists(select 1 from public.p4p_submission_returns r join public.p4p_month_submissions s on s.id=r.submission_id where s.month=v_month and r.staff_directory_id=v_sd and r.status='returned'
  and ((s.scope_type='unit' and s.unit_id=(select unit_id from public.people where id=v_person))
   or (s.scope_type='group' and exists(select 1 from public.staff_directory d where d.source_row=v_sd and (trim(coalesce(d.nursing_group,''))=s.group_name or s.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]'))))))) into v_allowed;
 if v_allowed then if tg_op='DELETE' then return old; else return new; end if; end if;
 select exists(select 1 from public.p4p_person_month_unlocks u where u.month=v_month and u.staff_directory_id=v_sd and u.status='open' and u.person_id=v_person) into v_allowed_additional;
 if v_allowed_additional then
  if tg_op='INSERT' then return new; end if;
  if tg_op='DELETE' and old.status in ('draft','rejected') then return old; end if;
  if tg_op='UPDATE' and old.status in ('draft','rejected') then return new; end if;
  if tg_op='UPDATE' and old.status='pending' and new.status in ('approved','draft','rejected')
   and (new.person_id,new.work_date,new.activity_code,new.qty,new.role,new.evidence,new.evidence_image_path,new.sub_activity,new.shift,new.parent_log_id,new.supplemental_reason)
    is not distinct from (old.person_id,old.work_date,old.activity_code,old.qty,old.role,old.evidence,old.evidence_image_path,old.sub_activity,old.shift,old.parent_log_id,old.supplemental_reason) then return new; end if;
 end if;
 raise exception 'หน่วยงานส่งผลงานประจำเดือนนี้แล้ว รายการถูกล็อก หากต้องแก้ไขต้องรอคณะกรรมการส่งกลับรายบุคคลหรือเปิดสิทธิ์บันทึกเพิ่ม';
end;$function$;

create or replace function public.p4p_review_unit(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare s public.p4p_month_submissions%rowtype; pend integer; extra_drafts integer; nm text;
begin
 if not public.p4p_can_act_as_committee() then raise exception 'เฉพาะกรรมการ P4P ที่ปฏิบัติหน้าที่เท่านั้นที่ทำเครื่องหมายตรวจแล้วได้'; end if;
 select * into s from public.p4p_month_submissions where id=p_submission_id for update;
 if not found or s.status not in ('submitted','resubmitted') then raise exception 'หน่วยงานนี้ยังไม่ส่งผลงานหรืออยู่ระหว่างแก้ไข'; end if;
 if exists(select 1 from public.p4p_closed_months where month=s.month) or exists(select 1 from public.p4p_monthly_reviews where month=s.month and status in ('reviewing','approved','closed')) then raise exception 'เดือนนี้เริ่มรับรองผลหรือปิดงวดแล้ว ไม่สามารถเปลี่ยนสถานะตรวจได้'; end if;
 if s.scope_type='unit' then select count(*) into pend from public.v_logs where month=s.month and status='pending' and unit_id=s.unit_id;
 else select count(*) into pend from public.v_logs vl where vl.month=s.month and vl.status='pending' and vl.unit_id is null and vl.person_id in
  (select p.id from public.people p join public.staff_directory d on d.source_row=p.staff_directory_id where d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
   and (trim(coalesce(d.nursing_group,''))=s.group_name or s.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]'))));
 end if;
 if pend>0 then raise exception 'ยังมีรายการรอรับรอง % รายการ หน่วยงานนี้ยังไม่พร้อมตรวจ',pend; end if;
 select count(*) into extra_drafts from public.logs l join public.p4p_person_month_unlocks u on u.person_id=l.person_id where u.submission_id=s.id and u.status='open' and l.status in ('draft','rejected') and date_trunc('month',l.work_date)::date=s.month;
 if extra_drafts>0 then raise exception 'ยังมีกิจกรรมเพิ่มเติมที่ยังไม่ได้ส่งรับรอง % รายการ',extra_drafts; end if;
 select coalesce(nullif(trim(full_name),''),nullif(trim(coalesce(prefix,'')||coalesce(first_name,'')||' '||coalesce(last_name,'')),''),username) into nm from public.profiles where user_id=auth.uid();
 insert into public.p4p_unit_reviews(submission_id,month,scope_type,unit_id,group_name,reviewed_by,reviewed_by_name) values(s.id,s.month,s.scope_type,s.unit_id,s.group_name,auth.uid(),nm)
 on conflict(submission_id) do update set reviewed_by=excluded.reviewed_by,reviewed_by_name=excluded.reviewed_by_name,reviewed_at=now();
 update public.p4p_person_month_unlocks set status='closed',closed_at=now() where submission_id=s.id and status='open';
 return jsonb_build_object('ok',true,'submission_id',s.id,'reviewed_by_name',nm);
end;$function$;