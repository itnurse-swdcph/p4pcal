create or replace function public.p4p_reopen_own_activity_approval(p_log_id bigint,p_reason text default 'ผู้มีสิทธิ์ในหน่วยงานยกเลิกการรับรองเพื่อทบทวนรายการอีกครั้ง')
returns jsonb language plpgsql security definer set search_path=public as $function$
declare l public.logs%rowtype; v_month date; v_owner uuid; v_reason text; v_submission_status text; v_is_central_admin boolean;
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบก่อนดำเนินการ'; end if;
 select exists(select 1 from public.profiles me where me.user_id=auth.uid() and me.role='admin' and me.username='11450' and me.staff_directory_id is null) into v_is_central_admin;
 if exists(select 1 from public.profiles me where me.user_id=auth.uid() and me.role='admin') and not v_is_central_admin then raise exception 'อนุญาตเฉพาะแอดมินกลาง 11450'; end if;
 select * into l from public.logs where id=p_log_id for update;
 if not found then raise exception 'ไม่พบกิจกรรมที่ต้องการแก้ไขการรับรอง'; end if;
 if l.status<>'approved' then raise exception 'แก้ไขการรับรองได้เฉพาะกิจกรรมที่รับรองแล้ว'; end if;
 if not v_is_central_admin and not public.can_approve_person(l.person_id) then raise exception 'ไม่มีสิทธิ์รับรองกิจกรรมของบุคลากรนี้'; end if;
 v_month:=date_trunc('month',l.work_date)::date;
 if exists(select 1 from public.p4p_closed_months where month=v_month) or exists(select 1 from public.p4p_monthly_reviews where month=v_month and status='reviewing') then raise exception 'งวดนี้อยู่ระหว่างรับรองหรือปิดงวดแล้ว ไม่สามารถแก้ไขการรับรองได้'; end if;
 select s.status into v_submission_status from public.p4p_month_submissions s
 join public.people p on p.id=l.person_id left join public.staff_directory d on d.source_row=p.staff_directory_id
 where s.month=v_month and ((s.scope_type='unit' and s.unit_id=p.unit_id) or
 (s.scope_type='group' and d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%' and
 (trim(coalesce(d.nursing_group,''))=s.group_name or s.group_name=any(regexp_split_to_array(coalesce(d.extra_nursing_group_names,''),'[,;|]'))))) limit 1;
 if v_submission_status in ('submitted','resubmitted','reviewed','returned') then raise exception 'หน่วยงานส่งผลงานแล้ว กรุณากดยกเลิกส่งผลงานก่อนจึงจะแก้ไขการรับรองกิจกรรมได้'; end if;
 v_reason:=left(trim(coalesce(nullif(p_reason,''),'ผู้มีสิทธิ์ในหน่วยงานยกเลิกการรับรองเพื่อทบทวนรายการอีกครั้ง')),500);
 select user_id into v_owner from public.people where id=l.person_id;
 perform set_config('p4p.committee_audit',p_log_id::text,true);
 update public.logs set status='pending',reject_reason=null,reviewed_by=auth.uid(),reviewed_at=now() where id=p_log_id;
 insert into public.p4p_activity_audit_events(log_id,month,actor_id,person_id,action,reason,old_status,new_status) values(l.id,v_month,auth.uid(),l.person_id,'reopen_approval',v_reason,'approved','pending');
 if v_owner is not null then insert into public.p4p_user_notifications(user_id,title,body,entity_type,entity_id) values(v_owner,'มีการแก้ไขการรับรองกิจกรรม','กิจกรรมรายการหนึ่งถูกนำกลับไปรอรับรองอีกครั้ง','activity',l.id); end if;
 return jsonb_build_object('ok',true,'log_id',l.id,'new_status','pending');
end;
$function$;
revoke all on function public.p4p_reopen_own_activity_approval(bigint,text) from public, anon;
grant execute on function public.p4p_reopen_own_activity_approval(bigint,text) to authenticated;
