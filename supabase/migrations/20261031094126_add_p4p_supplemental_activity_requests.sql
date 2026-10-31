alter table public.logs
  add column if not exists parent_log_id bigint null references public.logs(id) on delete restrict,
  add column if not exists supplemental_reason text null;

alter table public.logs
  add constraint logs_supplemental_pair_check
  check (
    (parent_log_id is null and supplemental_reason is null)
    or
    (parent_log_id is not null and length(trim(coalesce(supplemental_reason,''))) >= 5)
  );

create index if not exists logs_parent_log_id_idx
  on public.logs(parent_log_id) where parent_log_id is not null;

create or replace function public.validate_p4p_supplemental_log()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare p public.logs%rowtype;
begin
  if new.parent_log_id is null then
    if new.supplemental_reason is not null then
      raise exception 'เหตุผลการขอเพิ่มจำนวนต้องเชื่อมกับรายการต้นฉบับ';
    end if;
    return new;
  end if;
  select * into p from public.logs where id = new.parent_log_id;
  if not found then raise exception 'ไม่พบรายการต้นฉบับที่ต้องการขอเพิ่มจำนวน'; end if;
  if p.parent_log_id is not null or p.status <> 'approved' then
    raise exception 'ขอเพิ่มจำนวนได้เฉพาะรายการต้นฉบับที่รับรองแล้วเท่านั้น';
  end if;
  if p.person_id <> new.person_id or p.work_date <> new.work_date
     or p.activity_code <> new.activity_code or p.shift <> new.shift then
    raise exception 'รายการขอเพิ่มต้องเป็นบุคลากร วันที่ กิจกรรม และเวรเดียวกับรายการต้นฉบับ';
  end if;
  if length(trim(coalesce(new.supplemental_reason,''))) < 5 then
    raise exception 'กรุณาระบุเหตุผลการขอเพิ่มจำนวนอย่างน้อย 5 ตัวอักษร';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_p4p_supplemental_log on public.logs;
create trigger validate_p4p_supplemental_log
before insert or update on public.logs
for each row execute function public.validate_p4p_supplemental_log();

create or replace function public.prevent_duplicate_p4p_daily_activity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare excluded_log_id bigint := null;
begin
  if new.parent_log_id is not null then return new; end if;
  if tg_op = 'UPDATE'
     and new.person_id is not distinct from old.person_id
     and new.work_date is not distinct from old.work_date
     and new.activity_code is not distinct from old.activity_code
     and new.shift is not distinct from old.shift then
    return new;
  end if;
  if tg_op = 'UPDATE' then excluded_log_id := old.id; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(new.person_id::text || '|' || new.work_date::text || '|' || new.activity_code || '|' || new.shift, 0)
  );
  if exists (
    select 1 from public.logs l
    where l.person_id = new.person_id and l.work_date = new.work_date
      and l.activity_code = new.activity_code and l.shift = new.shift
      and l.parent_log_id is null
      and (excluded_log_id is null or l.id <> excluded_log_id)
  ) then
    raise exception using errcode = '23505',
      message = format('กิจกรรม %s ของบุคลากรรายนี้ในวันที่ %s (%s) บันทึกไว้แล้ว กรุณาใช้การขอเพิ่มจำนวนจากรายการต้นฉบับ',
        new.activity_code, new.work_date, new.shift);
  end if;
  return new;
end;
$$;

create or replace function public.logs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  r text := coalesce(public.my_role(), '');
  uid uuid := auth.uid();
  owner uuid;
  own boolean;
  changed boolean;
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.reject_reason := null;
    new.submitted_at := null;
    new.submitted_by := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    if uid is not null then new.entered_by := uid; end if;
    return new;
  end if;
  if uid is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select p.user_id into owner from public.people p where p.id = old.person_id;
  own := (uid = old.entered_by or uid = owner or r = 'admin');
  if tg_op = 'DELETE' then
    if old.status not in ('draft', 'rejected') then raise exception 'รายการที่ส่งแล้วหรือรับรองแล้วถูกล็อก ลบไม่ได้'; end if;
    if not own then raise exception 'ลบได้เฉพาะรายการที่ตนเองบันทึก'; end if;
    return old;
  end if;
  changed := (new.person_id, new.work_date, new.activity_code, new.qty, new.role,
    new.evidence, new.evidence_image_path, new.sub_activity, new.shift,
    new.parent_log_id, new.supplemental_reason)
    is distinct from
    (old.person_id, old.work_date, old.activity_code, old.qty, old.role,
    old.evidence, old.evidence_image_path, old.sub_activity, old.shift,
    old.parent_log_id, old.supplemental_reason);
  if old.status in ('draft', 'rejected') then
    if not own then raise exception 'แก้ไขหรือส่งได้เฉพาะรายการที่ตนเองบันทึก'; end if;
    if new.status = 'pending' then
      if changed then raise exception 'กรุณาบันทึกการแก้ไขก่อน แล้วจึงกดส่ง'; end if;
      new.submitted_at := now(); new.submitted_by := uid; new.reject_reason := null;
      new.reviewed_by := null; new.reviewed_at := null;
    elsif new.status in ('draft', 'rejected') then
      new.status := 'draft';
    else raise exception 'ต้องส่งรายการก่อน จึงจะรับรองได้';
    end if;
    return new;
  elsif old.status = 'pending' then
    if new.status in ('approved', 'rejected') then
      if not public.can_approve_person(old.person_id) then
        raise exception 'ไม่มีสิทธิ์รับรองรายการนี้ ลำดับการรับรอง: เจ้าหน้าที่ → หัวหน้างาน → หัวหน้ากลุ่มงาน → รักษาการหัวหน้าพยาบาล (รับรองรายการของตนเองไม่ได้)';
      end if;
      if changed then raise exception 'ผู้รับรองมีหน้าที่รับรองหรือไม่รับรองเท่านั้น แก้ไขรายการที่ส่งมาไม่ได้'; end if;
      if new.status = 'rejected' and length(trim(coalesce(new.reject_reason, ''))) = 0 then
        raise exception 'กรุณาระบุเหตุผลที่ไม่รับรอง';
      end if;
      if new.status = 'approved' then new.reject_reason := null; end if;
      new.reviewed_by := uid; new.reviewed_at := now(); return new;
    elsif new.status = 'pending' then
      if not own then raise exception 'แก้ไขรายการที่รอรับรองได้เฉพาะผู้บันทึกเท่านั้น'; end if;
      return new;
    else raise exception 'รายการที่ส่งแล้วถูกล็อก แก้ไขหรือลบไม่ได้';
    end if;
  end if;
  raise exception 'รายการที่รับรองแล้วถูกล็อก แก้ไขหรือลบไม่ได้';
end
$function$;
