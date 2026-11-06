-- Restrict NUR-091 through NUR-122 to นางเย็นใจ พิมพ์บรรณ only.
-- The person is resolved from the authoritative staff_directory mapping (source_row = 256),
-- and the authenticated account must be the account linked to that person.
create or replace function public.enforce_nur091_122_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner_person_id uuid;
  v_owner_user_id uuid;
begin
  if new.activity_code between 'NUR-091' and 'NUR-122' then
    select p.id, p.user_id
      into v_owner_person_id, v_owner_user_id
    from public.people p
    where p.staff_directory_id = 256
      and p.active = true
    limit 1;

    if v_owner_person_id is null or v_owner_user_id is null then
      raise exception 'ไม่พบการเชื่อมบัญชีของนางเย็นใจ พิมพ์บรรณ กรุณาติดต่อผู้ดูแลระบบ'
        using errcode = '23503';
    end if;

    if auth.uid() is distinct from v_owner_user_id
       or new.person_id is distinct from v_owner_person_id then
      raise exception 'กิจกรรม NUR-091 ถึง NUR-122 บันทึกได้เฉพาะนางเย็นใจ พิมพ์บรรณเท่านั้น'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_nur091_122_owner on public.logs;

create trigger trg_enforce_nur091_122_owner
before insert or update of activity_code, person_id
on public.logs
for each row
execute function public.enforce_nur091_122_owner();

revoke all on function public.enforce_nur091_122_owner() from public, anon;
grant execute on function public.enforce_nur091_122_owner() to authenticated;
