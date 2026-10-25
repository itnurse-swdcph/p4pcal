-- Enforce per-person, per-date, per-activity quantity limits across all log rows.
-- The advisory transaction lock prevents concurrent inserts from exceeding the cap.
create or replace function public.enforce_p4p_daily_activity_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  daily_limit numeric;
  already_logged numeric;
  excluded_log_id bigint := null;
begin
  select a.max_day into daily_limit
  from public.activities a
  where a.code = new.activity_code;

  if daily_limit is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    excluded_log_id := old.id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.person_id::text || '|' || new.work_date::text || '|' || new.activity_code, 0)
  );

  select coalesce(sum(l.qty), 0)
    into already_logged
  from public.logs l
  where l.person_id = new.person_id
    and l.work_date = new.work_date
    and l.activity_code = new.activity_code
    and (excluded_log_id is null or l.id <> excluded_log_id);

  if already_logged + new.qty > daily_limit then
    raise exception using
      errcode = '23514',
      message = format(
        'เกินจำนวนสูงสุดต่อวันสำหรับกิจกรรม %s: บันทึกไปแล้ว %s, กำลังเพิ่ม %s, กำหนดไม่เกิน %s ต่อวัน',
        new.activity_code, already_logged, new.qty, daily_limit
      );
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_p4p_daily_activity_limit on public.logs;
create trigger enforce_p4p_daily_activity_limit
before insert or update of person_id, work_date, activity_code, qty
on public.logs
for each row execute function public.enforce_p4p_daily_activity_limit();
