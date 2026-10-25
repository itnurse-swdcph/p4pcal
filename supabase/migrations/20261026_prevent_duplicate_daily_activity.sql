-- Prevent duplicate activity rows for the same person, date, and activity.
-- Existing rows can still be edited in place; a changed key cannot collide with another row.
create or replace function public.prevent_duplicate_p4p_daily_activity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  excluded_log_id bigint := null;
begin
  if tg_op = 'UPDATE'
     and new.person_id is not distinct from old.person_id
     and new.work_date is not distinct from old.work_date
     and new.activity_code is not distinct from old.activity_code then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    excluded_log_id := old.id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.person_id::text || '|' || new.work_date::text || '|' || new.activity_code, 0)
  );

  if exists (
    select 1
    from public.logs l
    where l.person_id = new.person_id
      and l.work_date = new.work_date
      and l.activity_code = new.activity_code
      and (excluded_log_id is null or l.id <> excluded_log_id)
  ) then
    raise exception using
      errcode = '23505',
      message = format(
        'กิจกรรม %s ของบุคลากรรายนี้ในวันที่ %s บันทึกไว้แล้ว กรุณาแก้ไขรายการเดิมแทนการสร้างรายการซ้ำ',
        new.activity_code, new.work_date
      );
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_p4p_daily_activity on public.logs;
create trigger prevent_duplicate_p4p_daily_activity
before insert or update of person_id, work_date, activity_code
on public.logs
for each row execute function public.prevent_duplicate_p4p_daily_activity();
