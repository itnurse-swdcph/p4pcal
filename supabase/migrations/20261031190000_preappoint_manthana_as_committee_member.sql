create table if not exists public.p4p_committee_preappointments (
  staff_directory_source_row integer primary key,
  active boolean not null default true,
  appointed_by uuid references public.profiles(user_id) on delete set null,
  linked_user_id uuid references public.profiles(user_id) on delete set null,
  appointed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.p4p_committee_preappointments enable row level security;
drop policy if exists "Authenticated can view P4P committee preappointments" on public.p4p_committee_preappointments;
create policy "Authenticated can view P4P committee preappointments"
on public.p4p_committee_preappointments for select to authenticated using (true);
drop policy if exists "Admins manage P4P committee preappointments" on public.p4p_committee_preappointments;
create policy "Admins manage P4P committee preappointments" on public.p4p_committee_preappointments
for all to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
grant select, insert, update, delete on public.p4p_committee_preappointments to authenticated;

insert into public.p4p_committee_preappointments(staff_directory_source_row, active)
select source_row, true from public.staff_directory
where source_row = 2 and first_name = 'มัณฑนา' and last_name = 'เพชรคำ'
  and position = 'พยาบาลวิชาชีพชำนาญการพิเศษ'
on conflict (staff_directory_source_row) do update set active = true, updated_at = now();

create or replace function public.p4p_link_preappointed_committee_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare preappointment public.p4p_committee_preappointments%rowtype;
begin
  if new.staff_directory_id is null then return new; end if;
  select * into preappointment from public.p4p_committee_preappointments
  where staff_directory_source_row = new.staff_directory_id and active = true;
  if not found then return new; end if;
  if not exists (
    select 1 from public.staff_directory sd
    where sd.source_row = preappointment.staff_directory_source_row
      and sd.first_name = 'มัณฑนา' and sd.last_name = 'เพชรคำ'
      and sd.position = 'พยาบาลวิชาชีพชำนาญการพิเศษ'
  ) then return new; end if;

  update public.profiles set role = 'committee'
  where user_id = new.user_id and role <> 'admin';

  insert into public.p4p_committee_members(user_id, active, is_chair, appointed_by, updated_at)
  values (new.user_id, true, false, preappointment.appointed_by, now())
  on conflict (user_id) do update set active = true, is_chair = false, updated_at = now();

  update public.p4p_committee_preappointments
  set linked_user_id = new.user_id, updated_at = now()
  where staff_directory_source_row = preappointment.staff_directory_source_row;
  return new;
end;
$$;

drop trigger if exists trg_p4p_link_preappointed_committee_member on public.profiles;
create trigger trg_p4p_link_preappointed_committee_member
after insert or update of staff_directory_id on public.profiles
for each row execute function public.p4p_link_preappointed_committee_member();

create or replace function public.p4p_committee_roster()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not (
    public.my_role()='admin' or
    (public.my_role()='committee' and public.p4p_is_committee_member())
  ) then raise exception 'ไม่มีสิทธิ์ดูทะเบียนคณะกรรมการ P4P'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,
      'full_name',coalesce(nullif(trim(p.full_name),''), nullif(trim(concat_ws(' ',sd.prefix,sd.first_name,sd.last_name)),'')),
      'position',coalesce(nullif(trim(p.position),''),sd.position),
      'active',m.active,'is_chair',m.is_chair,'appointed_at',m.appointed_at
    ) order by m.is_chair desc,coalesce(nullif(trim(p.full_name),''), concat_ws(' ',sd.prefix,sd.first_name,sd.last_name)))
    from public.p4p_committee_members m
    join public.profiles p on p.user_id=m.user_id
    left join public.staff_directory sd on sd.source_row=p.staff_directory_id
  ),'[]'::jsonb);
end;
$function$;
