create table if not exists public.p4p_appeal_result_history (
  id bigserial primary key,
  month date not null,
  appeal_id uuid not null references public.p4p_appeals(id),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  before_hash text,
  after_hash text not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists p4p_appeal_result_history_month_idx
  on public.p4p_appeal_result_history(month,created_at desc);
alter table public.p4p_appeal_result_history enable row level security;
revoke all on public.p4p_appeal_result_history from anon,authenticated;

create or replace function public.p4p_close_appeal(p_appeal_id uuid,p_comment text default '')
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  a public.p4p_appeals%rowtype;
  v_result jsonb;
  v_before jsonb;
  v_hash text;
  v_before_hash text;
  g jsonb;
  v_unfinished integer;
begin
  if auth.uid() is null or not (public.p4p_is_appeal_admin() or public.p4p_can_act_as_committee()) then
    raise exception 'ไม่มีสิทธิ์ปิดคำอุทธรณ์';
  end if;
  select * into a from public.p4p_appeals where id=p_appeal_id for update;
  if not found or a.status not in ('approved','editing','resubmitted','rejected','needs_info') then
    raise exception 'ไม่สามารถปิดคำขอนี้ได้';
  end if;
  if a.status in ('approved','editing','resubmitted') then
    select count(*) into v_unfinished from public.logs l
      join public.p4p_appeal_people ap on ap.person_id=l.person_id
      where ap.appeal_id=p_appeal_id and date_trunc('month',l.work_date)::date=a.month
        and l.status in ('pending','draft','rejected');
    if v_unfinished>0 then raise exception 'ยังมีกิจกรรมที่รอรับรองหรือยังไม่ส่ง % รายการ กรุณาให้หน่วยงานตรวจสอบก่อนปิดอุทธรณ์',v_unfinished; end if;
    select result into v_before from public.p4p_closed_months where month=a.month for update;
    if v_before is null then raise exception 'ไม่พบผลประกาศเดิมของเดือนนี้'; end if;
    v_before_hash:=md5(v_before::text);
    update public.p4p_person_month_unlocks set status='closed',closed_at=now() where appeal_id=p_appeal_id and status='open';
    perform set_config('p4p.force_recalculate','on',true);
    v_result:=public.p4p_calc(a.month)||jsonb_build_object('closed',true,'appeal_recalculated',true,'last_appeal_id',p_appeal_id);
    v_hash:=md5(v_result::text);
    insert into public.p4p_appeal_result_history(month,appeal_id,before_snapshot,after_snapshot,before_hash,after_hash,actor_id)
      values(a.month,p_appeal_id,v_before,v_result,v_before_hash,v_hash,auth.uid());
    update public.p4p_closed_months set result=v_result,snapshot_hash=v_hash where month=a.month;
    update public.p4p_monthly_reviews set snapshot=v_result,snapshot_hash=v_hash,updated_at=now() where month=a.month;
    for g in select value from jsonb_array_elements(coalesce(v_result->'groups','[]'::jsonb)) loop
      insert into public.p4p_carry(pay_group,month,extra,quality)
      values((g->>'pay_group')::integer,a.month,coalesce((g->>'carry_extra_out')::numeric,0),0)
      on conflict(pay_group,month) do update set extra=excluded.extra,quality=excluded.quality;
    end loop;
    insert into public.p4p_monthly_review_events(month,actor_id,event_type,details)
      values(a.month,auth.uid(),'appeal_recalculated',jsonb_build_object('appeal_id',p_appeal_id,
        'before_hash',v_before_hash,'after_hash',v_hash,
        'history_id',currval(pg_get_serial_sequence('public.p4p_appeal_result_history','id')),
        'comment',trim(coalesce(p_comment,''))));
  else
    update public.p4p_person_month_unlocks set status='closed',closed_at=now() where appeal_id=p_appeal_id and status='open';
  end if;
  update public.p4p_appeals set status='closed',review_comment=coalesce(nullif(trim(p_comment),''),review_comment),updated_at=now()
    where id=p_appeal_id;
  insert into public.p4p_appeal_audit(appeal_id,actor_id,event_type,details)
    values(p_appeal_id,auth.uid(),'closed',jsonb_build_object('comment',trim(coalesce(p_comment,'')),
      'recalculated',a.status in ('approved','editing','resubmitted'),'before_hash',v_before_hash,'after_hash',v_hash));
  return jsonb_build_object('ok',true,'appeal_id',p_appeal_id,'recalculated',a.status in ('approved','editing','resubmitted'),
    'before_hash',v_before_hash,'after_hash',v_hash);
end;
$$;
revoke all on function public.p4p_close_appeal(uuid,text) from public,anon;
grant execute on function public.p4p_close_appeal(uuid,text) to authenticated;
