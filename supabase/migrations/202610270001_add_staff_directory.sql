create table if not exists public.staff_directory (
  source_row integer primary key, prefix text not null, first_name text not null, last_name text not null,
  position text not null, org_role text not null, staff_group text not null, staff_type text not null,
  unit_name text, extra_unit_names text, nursing_group text not null, extra_nursing_group_names text,
  active boolean not null default true, imported_at timestamptz not null default now()
);
create index if not exists staff_directory_name_idx on public.staff_directory (first_name, last_name);
create index if not exists staff_directory_active_idx on public.staff_directory (active);
alter table public.staff_directory enable row level security;
revoke all on public.staff_directory from anon, authenticated;
grant all on public.staff_directory to service_role;
alter table public.profiles
  add column if not exists staff_directory_id integer references public.staff_directory(source_row),
  add column if not exists org_role text, add column if not exists staff_group text,
  add column if not exists staff_type text, add column if not exists nursing_group text,
  add column if not exists extra_unit_names text, add column if not exists extra_nursing_group_names text;
create unique index if not exists profiles_staff_directory_id_uidx on public.profiles(staff_directory_id) where staff_directory_id is not null;