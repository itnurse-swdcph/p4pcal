-- ให้กรรมการ P4P (และผู้ดูแลระบบ) อ่านวันลารายบุคคลของเดือนที่เลือก
-- เพื่อใช้พิมพ์ใบสรุปผลงานรายบุคคลจากหน้า "ตรวจกิจกรรมรายบุคคล"
-- ตาราง p4p_monthly_leave มี RLS อ่านได้เฉพาะ admin/head จึงเปิดผ่านฟังก์ชันที่ตรวจสิทธิ์และคืนเฉพาะ 3 ค่าที่ใช้พิมพ์
create or replace function public.p4p_committee_person_leave(p_staff_directory_id integer, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null or not (
    public.my_role() = 'admin' or
    (public.my_role() = 'committee' and public.p4p_is_committee_member())
  ) then
    raise exception 'ไม่มีสิทธิ์ดูวันลารายบุคคล';
  end if;

  select coalesce(sum(l.personal_leave_days), 0) as personal_leave_days,
         coalesce(sum(l.sick_leave_days), 0)     as sick_leave_days,
         coalesce(sum(l.annual_leave_days), 0)   as annual_leave_days
    into r
    from public.p4p_monthly_leave l
   where l.staff_directory_id = p_staff_directory_id
     and l.month = date_trunc('month', p_month)::date;

  return jsonb_build_object(
    'personal_leave_days', coalesce(r.personal_leave_days, 0),
    'sick_leave_days',     coalesce(r.sick_leave_days, 0),
    'annual_leave_days',   coalesce(r.annual_leave_days, 0)
  );
end;
$$;

revoke execute on function public.p4p_committee_person_leave(integer, date) from public, anon;
grant execute on function public.p4p_committee_person_leave(integer, date) to authenticated;
