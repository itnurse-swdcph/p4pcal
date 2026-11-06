-- Clear the previous unit-level committee review whenever an approved activity is returned/rejected.
-- The unit must be reviewed again after the staff member corrects the activity and the supervisor certifies it.
create or replace function public.p4p_committee_audit_activity(p_log_id bigint, p_action text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l public.logs%rowtype;
  owner_user uuid;
  action_title text;
  new_status text;
  m date;
begin
  if auth.uid() is null or not (
      (public.my_role() = 'committee' and public.p4p_is_committee_member())
      or (public.my_role() = 'admin' and (
            exists (select 1 from public.profiles pr where pr.user_id = auth.uid() and pr.username = '11450')
            or exists (select 1 from public.p4p_committee_members cm where cm.user_id = auth.uid() and cm.active)
         ))
    )
    then raise exception 'เฉพาะกรรมการ P4P ที่ปฏิบัติหน้าที่ตรวจสอบกิจกรรมได้'; end if;
  if p_action not in ('return_for_correction','reject') then raise exception 'ประเภทการตรวจสอบไม่ถูกต้อง'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'; end if;
  select * into l from public.logs where id=p_log_id for update;
  if not found then raise exception 'ไม่พบกิจกรรมที่ต้องการตรวจสอบ'; end if;
  if l.status<>'approved' then raise exception 'ตรวจสอบย้อนหลังได้เฉพาะกิจกรรมที่อนุมัติแล้ว'; end if;
  m:=date_trunc('month',l.work_date)::date;
  if exists(select 1 from public.p4p_closed_months where month=m)
     or exists(select 1 from public.p4p_monthly_reviews where month=m and status='reviewing')
    then raise exception 'งวดนี้เริ่มรับรองหรือปิดงวดแล้ว ไม่สามารถแก้ไขผลกิจกรรมจากหน้าสุ่มตรวจได้'; end if;
  select user_id into owner_user from public.people where id=l.person_id;
  new_status:=case when p_action='return_for_correction' then 'pending' else 'draft' end;
  perform set_config('p4p.committee_audit', p_log_id::text, true);
  update public.logs set status=new_status,reject_reason=trim(p_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=p_log_id;
  insert into public.p4p_activity_audit_events(log_id,month,actor_id,person_id,action,reason,old_status,new_status)
  values(l.id,m,auth.uid(),l.person_id,p_action,trim(p_reason),l.status,new_status);

  delete from public.p4p_unit_reviews ur
  using public.p4p_month_submissions s, public.people p
  where ur.submission_id=s.id
    and p.id=l.person_id
    and s.month=m
    and (
      (s.scope_type='unit' and s.unit_id=p.unit_id)
      or (s.scope_type='group' and exists (
        select 1 from public.staff_directory d
        where d.source_row=p.staff_directory_id
          and d.unit_name is null
          and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
          and (trim(coalesce(d.nursing_group,''))=s.group_name
               or s.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]')))
      ))
    );

  if owner_user is not null then
    action_title:=case when p_action='return_for_correction' then 'กิจกรรมถูกส่งกลับแก้ไข' else 'กิจกรรมไม่ผ่านการตรวจสอบ' end;
    insert into public.p4p_user_notifications(user_id,title,body,entity_type,entity_id)
    values(owner_user,action_title,trim(p_reason),'activity',l.id);
  end if;
  return jsonb_build_object('ok',true,'log_id',l.id,'new_status',new_status,'notified',owner_user is not null);
end;
$function$;
