-- หัวหน้าดูแลได้หลายหน่วย + หัวหน้ากลุ่มงานดูแลทุกหน่วยในกลุ่มงานตัวเองอัตโนมัติ
create table if not exists profile_units(
  user_id uuid not null references profiles(user_id) on delete cascade,
  unit_id int not null references units(id) on delete cascade,
  approved bool not null default false,   -- ผู้ใช้ขอเพิ่มเองตอนสมัคร = false, ผู้ดูแลอนุมัติ/เพิ่มให้ = true
  primary key (user_id, unit_id));
alter table profile_units enable row level security;

create or replace function my_units() returns setof int language sql stable security definer set search_path=public as $$
  select unit_id from profiles where user_id = auth.uid() and unit_id is not null
  union select unit_id from profile_units where user_id = auth.uid() and approved
  union select u.id from profiles p join units base on base.id = p.unit_id join units u on u.parent_group = base.parent_group
        where p.user_id = auth.uid() and p.position = 'หัวหน้ากลุ่มงานการพยาบาล' $$;
create or replace function in_my_units(uid int) returns bool language sql stable security definer set search_path=public as $$
  select uid in (select my_units()) $$;

create or replace function can_write_person(pid uuid) returns bool language sql stable security definer set search_path=public as $$
  select exists(select 1 from people p where p.id = pid and (
    p.user_id = auth.uid() or (my_role() = 'head' and in_my_units(p.unit_id)) or my_role() = 'admin')) $$;

drop policy prof_read on profiles;
create policy prof_read on profiles for select to authenticated using (
  user_id = auth.uid() or my_role() in ('committee','admin') or (my_role() = 'head' and in_my_units(unit_id)));
drop policy ppl_read on people;
create policy ppl_read on people for select to authenticated using (
  user_id = auth.uid() or my_role() in ('committee','admin') or (my_role() = 'head' and in_my_units(unit_id)));
drop policy ppl_head on people;
create policy ppl_head on people for all to authenticated
  using (my_role() = 'admin' or (my_role() = 'head' and in_my_units(unit_id)))
  with check (my_role() = 'admin' or (my_role() = 'head' and in_my_units(unit_id)));
drop policy us_read on unit_settings;
create policy us_read on unit_settings for select to authenticated using (
  my_role() in ('committee','admin') or in_my_units(unit_id));

create policy pu_read on profile_units for select to authenticated using (user_id = auth.uid() or my_role() in ('committee','admin'));
create policy pu_self_ins on profile_units for insert to authenticated with check (user_id = auth.uid() and approved = false);
create policy pu_self_del on profile_units for delete to authenticated using (user_id = auth.uid() and not approved);
create policy pu_admin on profile_units for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

revoke execute on function my_units() from public, anon;
revoke execute on function in_my_units(int) from public, anon;
grant execute on function my_units() to authenticated;
grant execute on function in_my_units(int) to authenticated;
