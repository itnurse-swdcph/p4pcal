alter table public.app_settings
  drop constraint if exists app_settings_cap_shift_points_max_90;

alter table public.app_settings
  add constraint app_settings_cap_shift_points_max_90
  check (key <> 'cap_shift_points' or value <= 90);
