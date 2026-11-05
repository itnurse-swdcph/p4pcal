-- สถานะ "ตรวจแล้ว" รายหน่วยงาน/กลุ่มงาน โดยกรรมการ P4P
-- - กรรมการที่ปฏิบัติหน้าที่ทุกคนกดตรวจ/ยกเลิกได้
-- - ล้างสถานะอัตโนมัติเมื่อผลงานถูกส่งกลับหรือส่งซ้ำ
-- - ต้องตรวจครบทุกหน่วยงานที่ส่งผลงานก่อนเริ่มรับรอง (p4p_start_review)

create table if not exists public.p4p_unit_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.p4p_month_submissions(id) on delete cascade,
  month date not null,
  scope_type text not null check (scope_type in ('unit', 'group')),
  unit_id integer references public.units(id),
  group_name text,
  reviewed_by uuid not null references auth.users(id),
  reviewed_by_name text,
  reviewed_at timestamptz not null default now()
);
create index if not exists p4p_unit_reviews_month_idx on public.p4p_unit_reviews (month);

-- เข้าถึงผ่านฟังก์ชัน security definer เท่านั้น
alter table public.p4p_unit_reviews enable row level security;

-- ล้างสถานะตรวจแล้วเมื่อสถานะการส่งผลงานเปลี่ยน (ส่งกลับ / ส่งซ้ำ / ส่งใหม่)
create or replace function public.p4p_clear_unit_review_on_submission_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.status is distinct from old.status then
    delete from public.p4p_unit_reviews where submission_id = new.id;
  end if;
  return new;
end $function$;

drop trigger if exists trg_p4p_clear_unit_review on public.p4p_month_submissions;
create trigger trg_p4p_clear_unit_review
  after update of status on public.p4p_month_submissions
  for each row execute function public.p4p_clear_unit_review_on_submission_change();

create or replace function public.p4p_review_unit(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  s public.p4p_month_submissions%rowtype;
  pend integer;
  nm text;
begin
  if auth.uid() is null or public.my_role() <> 'committee' or not public.p4p_is_committee_member() then
    raise exception 'เฉพาะกรรมการ P4P ที่ปฏิบัติหน้าที่เท่านั้นที่ทำเครื่องหมายตรวจแล้วได้';
  end if;
  select * into s from public.p4p_month_submissions where id = p_submission_id for update;
  if not found or s.status not in ('submitted', 'resubmitted') then
    raise exception 'หน่วยงานนี้ยังไม่ส่งผลงานหรืออยู่ระหว่างแก้ไข';
  end if;
  if exists (select 1 from public.p4p_closed_months where month = s.month)
     or exists (select 1 from public.p4p_monthly_reviews where month = s.month and status in ('reviewing', 'approved', 'closed')) then
    raise exception 'เดือนนี้เริ่มรับรองผลหรือปิดงวดแล้ว ไม่สามารถเปลี่ยนสถานะตรวจได้';
  end if;

  if s.scope_type = 'unit' then
    select count(*) into pend from public.v_logs
      where month = s.month and status = 'pending' and unit_id = s.unit_id;
  else
    select count(*) into pend from public.v_logs vl
      where vl.month = s.month and vl.status = 'pending' and vl.unit_id is null
        and vl.person_id in (
          select p.id from public.people p join public.staff_directory d on d.source_row = p.staff_directory_id
          where d.unit_name is null and d.org_role ilike '%หัวหน้ากลุ่มงาน%'
            and (trim(coalesce(d.nursing_group, '')) = s.group_name
                 or s.group_name = any (regexp_split_to_array(coalesce(d.extra_nursing_group_names, ''), '[,;|]'))));
  end if;
  if pend > 0 then
    raise exception 'ยังมีรายการรอรับรอง % รายการ หน่วยงานนี้ยังไม่พร้อมตรวจ', pend;
  end if;

  select coalesce(nullif(trim(full_name), ''),
                  nullif(trim(coalesce(prefix, '') || coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
                  username)
    into nm from public.profiles where user_id = auth.uid();

  insert into public.p4p_unit_reviews (submission_id, month, scope_type, unit_id, group_name, reviewed_by, reviewed_by_name)
  values (s.id, s.month, s.scope_type, s.unit_id, s.group_name, auth.uid(), nm)
  on conflict (submission_id) do update
    set reviewed_by = excluded.reviewed_by, reviewed_by_name = excluded.reviewed_by_name, reviewed_at = now();

  return jsonb_build_object('ok', true, 'submission_id', s.id, 'reviewed_by_name', nm);
end $function$;

create or replace function public.p4p_unreview_unit(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare s public.p4p_month_submissions%rowtype;
begin
  if auth.uid() is null or public.my_role() <> 'committee' or not public.p4p_is_committee_member() then
    raise exception 'เฉพาะกรรมการ P4P ที่ปฏิบัติหน้าที่เท่านั้นที่ยกเลิกสถานะตรวจแล้วได้';
  end if;
  select * into s from public.p4p_month_submissions where id = p_submission_id for update;
  if not found then raise exception 'ไม่พบรายการส่งผลงาน'; end if;
  if exists (select 1 from public.p4p_closed_months where month = s.month)
     or exists (select 1 from public.p4p_monthly_reviews where month = s.month and status in ('reviewing', 'approved', 'closed')) then
    raise exception 'เดือนนี้เริ่มรับรองผลหรือปิดงวดแล้ว ไม่สามารถเปลี่ยนสถานะตรวจได้';
  end if;
  delete from public.p4p_unit_reviews where submission_id = p_submission_id;
  return jsonb_build_object('ok', true, 'submission_id', p_submission_id);
end $function$;

create or replace function public.p4p_committee_unit_reviews(p_month date)
returns table (submission_id uuid, scope_type text, unit_id integer, group_name text,
               reviewed_by uuid, reviewed_by_name text, reviewed_at timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not (public.my_role() = 'admin' or (public.my_role() = 'committee' and public.p4p_is_committee_member())) then
    raise exception 'ไม่มีสิทธิ์ดูสถานะการตรวจหน่วยงาน';
  end if;
  return query
    select r.submission_id, r.scope_type, r.unit_id, r.group_name, r.reviewed_by, r.reviewed_by_name, r.reviewed_at
    from public.p4p_unit_reviews r where r.month = date_trunc('month', p_month)::date;
end $function$;

revoke all on function public.p4p_review_unit(uuid), public.p4p_unreview_unit(uuid), public.p4p_committee_unit_reviews(date) from public, anon;
grant execute on function public.p4p_review_unit(uuid), public.p4p_unreview_unit(uuid), public.p4p_committee_unit_reviews(date) to authenticated;

-- ต้องตรวจครบทุกหน่วยงานที่ส่งผลงานก่อนเริ่มรับรอง: เพิ่มเงื่อนไขใน p4p_start_review
do $patch$
declare
  d text := pg_get_functiondef('public.p4p_start_review(date)'::regprocedure);
  anchor text := E'  if pending_count>0 then raise exception ''ยังมีรายการรอรับรอง % รายการ ต้องจัดการให้หมดก่อนเริ่มรับรองผล'',pending_count; end if;\n';
  extra text := E'  if exists(select 1 from public.p4p_month_submissions s where s.month=m and s.status in (''submitted'',''resubmitted'') and not exists(select 1 from public.p4p_unit_reviews r where r.submission_id=s.id))\n    then raise exception ''ยังตรวจหน่วยงานที่ส่งผลงานไม่ครบ ต้องกดตรวจแล้วให้ครบก่อนเริ่มรับรองผล''; end if;\n  if exists (select 1 from public.units u where exists (select 1 from public.staff_directory d where d.active is true and trim(d.unit_name)=trim(u.name)) and not exists (select 1 from public.p4p_month_submissions s join public.p4p_unit_reviews r on r.submission_id=s.id where s.month=m and s.scope_type=''unit'' and s.unit_id=u.id and s.status in (''submitted'',''resubmitted'')))\n    then raise exception ''ยังมีหน่วยงานที่มีบุคลากรไม่ได้ส่งผลงานหรือยังตรวจไม่ครบทุกหน่วยงาน''; end if;\n';
begin
  if position(anchor in d) = 0 then raise exception 'p4p_start_review changed: anchor not found, patch not applied'; end if;
  if position('p4p_unit_reviews' in d) > 0 then return; end if;
  execute replace(d, anchor, anchor || extra);
end $patch$;
