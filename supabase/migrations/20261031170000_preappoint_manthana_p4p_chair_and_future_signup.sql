-- Pre-appoint the P4P committee chair before account registration.
-- The profile trigger links the appointment when the staff member signs up
-- using the matching staff_directory source_row.

create table if not exists public.p4p_committee_designations (
  staff_directory_source_row integer primary key,
  full_name text not null,
  position text not null,
  designation text not null default 'chair',
  active boolean not null default true,
  linked_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint p4p_committee_designations_designation_check check (designation in ('chair'))
);

alter table public.p4p_committee_designations enable row level security;
drop policy if exists "Authenticated can view P4P committee designations" on public.p4p_committee_designations;
create policy "Authenticated can view P4P committee designations"
on public.p4p_committee_designations for select to authenticated using (true);
grant select on public.p4p_committee_designations to authenticated;

insert into public.p4p_committee_designations
  (staff_directory_source_row, full_name, position, designation, active)
select source_row, concat_ws(' ', prefix, first_name, last_name), position, 'chair', true
from public.staff_directory
where source_row = 2
  and first_name = 'มัณฑนา'
  and last_name = 'เพชรคำ'
  and position = 'พยาบาลวิชาชีพชำนาญการพิเศษ'
on conflict (staff_directory_source_row) do update
set full_name = excluded.full_name,
    position = excluded.position,
    designation = 'chair',
    active = true,
    updated_at = now();

create or replace function public.p4p_link_preappointed_chair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  designation_row public.p4p_committee_designations%rowtype;
begin
  if new.staff_directory_id is null then
    return new;
  end if;

  select * into designation_row
  from public.p4p_committee_designations
  where staff_directory_source_row = new.staff_directory_id
    and active = true
    and designation = 'chair';

  if not found then
    return new;
  end if;

  if not exists (
    select 1 from public.staff_directory sd
    where sd.source_row = designation_row.staff_directory_source_row
      and sd.first_name = 'มัณฑนา'
      and sd.last_name = 'เพชรคำ'
      and sd.position = 'พยาบาลวิชาชีพชำนาญการพิเศษ'
  ) then
    return new;
  end if;

  update public.p4p_committee_members
     set is_chair = false, updated_at = now()
   where active = true and is_chair and user_id <> new.user_id;

  insert into public.p4p_committee_members
    (user_id, active, is_chair, appointed_by, updated_at)
  values (new.user_id, true, true, null, now())
  on conflict (user_id) do update
    set active = true, is_chair = true, updated_at = now();

  update public.p4p_committee_designations
     set linked_user_id = new.user_id, updated_at = now()
   where staff_directory_source_row = designation_row.staff_directory_source_row;

  return new;
end;
$$;

drop trigger if exists trg_p4p_link_preappointed_chair on public.profiles;
create trigger trg_p4p_link_preappointed_chair
after insert or update of staff_directory_id on public.profiles
for each row execute function public.p4p_link_preappointed_chair();
