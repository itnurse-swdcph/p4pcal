-- P4P กลุ่มการพยาบาล : Supabase schema  (รันใน SQL Editor ตามลำดับ: schema.sql แล้ว seed.sql)
create table positions(name text primary key, grp text not null, rate numeric not null, guarantee numeric not null);
create table units(id serial primary key, name text unique not null, parent_group text);
create table people(
  id uuid primary key default gen_random_uuid(), prefix text, first_name text, last_name text, name text not null,
  position text not null references positions(name), unit_id int not null references units(id),
  sub_unit text, user_id uuid unique references auth.users(id) on delete set null, active bool default true, unique(unit_id,name));
create table profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text, prefix text, first_name text, last_name text, position text references positions(name), role text not null default 'staff' check (role in ('staff','head','committee','admin')),
  unit_id int references units(id));
create table activities(
  code text primary key, domain text not null check (domain in ('บริหาร','บริการ','วิชาการ')), title text not null,
  uom text, minutes numeric not null, use_role_mult bool default false, max_day numeric, max_month numeric,
  need_evidence bool default false, definition text, no_dup_group text, eligible text[] not null, note text, active bool default true);
create table app_settings(key text primary key, value numeric not null, label text);
create table unit_settings(
  unit_id int references units(id), month date, budget numeric default 0, baht_per_point numeric default 0,
  deduct_guarantee bool default true, primary key(unit_id, month));
create table logs(
  id bigserial primary key, person_id uuid not null references people(id) on delete cascade,
  work_date date not null, activity_code text not null references activities(code),
  role text, qty numeric not null check (qty > 0), evidence text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid, entered_by uuid default auth.uid(), created_at timestamptz default now());
create index on logs(person_id, work_date);

-- ===== helper =====
create function my_role() returns text language sql stable security definer set search_path=public as
  $$ select role from profiles where user_id = auth.uid() $$;
create function my_unit() returns int language sql stable security definer set search_path=public as
  $$ select unit_id from profiles where user_id = auth.uid() $$;
create function can_write_person(pid uuid) returns bool language sql stable security definer set search_path=public as $$
  select exists(select 1 from people p where p.id = pid and (
    p.user_id = auth.uid()
    or (my_role() = 'head' and p.unit_id = my_unit()) or my_role() = 'admin')) $$;

-- สมัครใหม่: รับ คำนำหน้า/ชื่อ/สกุล/ตำแหน่ง/หน่วยงาน จาก metadata แล้วสร้างโปรไฟล์ + รายชื่อบุคลากร (ผูกกับรายชื่อเดิมถ้าชื่อตรงกัน)
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare m jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
  pf text := trim(coalesce(m->>'prefix','')); fn text := trim(coalesce(m->>'first_name','')); ln text := trim(coalesce(m->>'last_name',''));
  ps text := nullif(m->>'position',''); uid int := nullif(m->>'unit_id','')::int; fname text; pid uuid;
begin
  fname := pf || fn || ' ' || ln;
  insert into profiles(user_id, full_name, prefix, first_name, last_name, position, unit_id)
    values (new.id, fname, pf, fn, ln, ps, uid);
  if ps is not null and uid is not null and fn <> '' then
    select id into pid from people where unit_id = uid and name = fname and user_id is null limit 1;
    if pid is not null then
      update people set user_id = new.id, position = ps, prefix = pf, first_name = fn, last_name = ln where id = pid;
    else
      insert into people(prefix, first_name, last_name, name, position, unit_id, user_id) values (pf, fn, ln, fname, ps, uid, new.id);
    end if;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ลูกจ้างแก้ไขรายการได้ แต่เปลี่ยนสถานะรับรองเองไม่ได้ (แก้แล้วกลับเป็นรอรับรอง)
create function logs_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    if my_role() not in ('head','admin') then new.status := 'pending'; end if;
    return new;
  end if;
  if my_role() in ('head','admin') then
    if new.status <> old.status then new.reviewed_by := auth.uid(); end if;
  else new.status := 'pending'; end if;
  return new;
end $$;
create trigger trg_logs_guard before insert or update on logs for each row execute function logs_guard();

-- ===== RLS =====
alter table positions enable row level security; alter table units enable row level security;
alter table people enable row level security; alter table profiles enable row level security;
alter table activities enable row level security; alter table app_settings enable row level security;
alter table unit_settings enable row level security; alter table logs enable row level security;

create policy ref_read on positions for select to anon, authenticated using (true);
create policy ref_read on units for select to anon, authenticated using (true);
create policy ref_read on activities for select to authenticated using (true);
create policy ref_read on app_settings for select to authenticated using (true);
create policy ref_admin on positions for all to authenticated using (my_role()='admin') with check (my_role()='admin');
create policy ref_admin on units for all to authenticated using (my_role()='admin') with check (my_role()='admin');
create policy ref_admin on activities for all to authenticated using (my_role()='admin') with check (my_role()='admin');
create policy ref_admin on app_settings for all to authenticated using (my_role()='admin') with check (my_role()='admin');

create policy prof_read on profiles for select to authenticated using (
  user_id = auth.uid() or my_role() in ('committee','admin') or (my_role()='head' and unit_id = my_unit()));
create policy prof_admin on profiles for all to authenticated using (my_role()='admin') with check (my_role()='admin');

create policy ppl_read on people for select to authenticated using (
  user_id = auth.uid() or my_role() in ('committee','admin') or (my_role()='head' and unit_id = my_unit()));
create policy ppl_head on people for all to authenticated
  using (my_role()='admin' or (my_role()='head' and unit_id = my_unit()))
  with check (my_role()='admin' or (my_role()='head' and unit_id = my_unit()));

create policy us_read on unit_settings for select to authenticated using (
  my_role() in ('committee','admin') or unit_id = my_unit());
create policy us_write on unit_settings for all to authenticated
  using (my_role() in ('committee','admin')) with check (my_role() in ('committee','admin'));

create policy log_read on logs for select to authenticated using (
  my_role() in ('committee','admin') or can_write_person(person_id));
create policy log_ins on logs for insert to authenticated with check (can_write_person(person_id));
create policy log_upd on logs for update to authenticated using (can_write_person(person_id)) with check (can_write_person(person_id));
create policy log_del on logs for delete to authenticated using (
  can_write_person(person_id) and (status='pending' or my_role() in ('head','admin')));

-- ===== คำนวณแต้ม + ตรวจสอบอัตโนมัติ (เหมือนแผ่น "บันทึก") =====
-- errors = ✗ ไม่นับแต้ม | warnings = ! ให้หัวหน้าตรวจทาน (ยังนับแต้ม)
create view v_logs with (security_invoker = true) as
with b as (
  select l.id, l.person_id, l.work_date, l.activity_code, l.role, l.qty, l.evidence, l.status, l.created_at,
         p.name person_name, p.unit_id, p.position, pos.grp, pos.rate, pos.guarantee,
         a.domain, a.title, a.uom, a.minutes, a.max_day, a.max_month, a.need_evidence, a.no_dup_group, a.eligible, a.use_role_mult,
         case when a.use_role_mult then
           (select value from app_settings where key = case coalesce(l.role,'') when 'ประธาน' then 'mult_chair'
              when 'เลขานุการ/กรรมการ' then 'mult_sec' else 'mult_member' end)
         else 1 end mult
  from logs l join people p on p.id = l.person_id join positions pos on pos.name = p.position
  join activities a on a.code = l.activity_code
), c as (
  select *, l_min as total_min, round(l_min * rate, 2) points,
    sum(qty) over (partition by person_id, activity_code, work_date) day_qty,
    sum(qty) over (partition by person_id, activity_code, date_trunc('month', work_date)) mon_qty,
    sum(l_min) over (partition by person_id, work_date) day_min,
    count(*) over (partition by person_id, work_date, split_part(no_dup_group, ':', 1)) grp_cnt,
    count(*) over (partition by person_id, work_date, no_dup_group) var_cnt
  from (select b.*, qty * minutes * mult l_min from b) b
), d as (
  select c.*,
    array_remove(array[
      case when not (grp = any(eligible)) then 'ตำแหน่งนี้บันทึกกิจกรรมนี้ไม่ได้' end,
      case when work_date > current_date then 'วันที่อยู่ในอนาคต' end ], null) errors,
    array_remove(array[
      case when use_role_mult and coalesce(role,'') = '' then 'ไม่ระบุบทบาท (คิด ×สมาชิก)' end,
      case when need_evidence and coalesce(evidence,'') = '' then 'ไม่ระบุหลักฐาน' end,
      case when max_day > 0 and day_qty > max_day then 'เกินเพดาน/วัน (' || max_day || ')' end,
      case when max_month > 0 and mon_qty > max_month then 'เกินเพดาน/เดือน (' || max_month || ')' end,
      case when no_dup_group is not null and grp_cnt > var_cnt then 'ซ้ำซ้อนกับกิจกรรมทดแทนกันในวันเดียวกัน' end,
      case when day_min > (select value from app_settings where key = 'max_day_minutes') then 'เวลารวมในวันนี้เกินกำหนด' end ], null) warnings
  from c)
select d.*, case when cardinality(errors) > 0 or status = 'rejected' then 0 else points end counted_points,
       date_trunc('month', work_date)::date as month from d;
grant select on v_logs to authenticated;

-- ความปลอดภัย: ไม่ให้เรียกฟังก์ชัน security definer ผ่าน API โดยตรง
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.logs_guard() from public, anon, authenticated;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.my_unit() from public, anon;
revoke execute on function public.can_write_person(uuid) from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_unit() to authenticated;
grant execute on function public.can_write_person(uuid) to authenticated;
