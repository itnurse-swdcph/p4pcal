-- สรุปจำนวนกิจกรรมตามสถานะรายบุคคล/หน่วยงาน สำหรับหน้าตรวจสอบของคณะกรรมการ P4P (อ่านอย่างเดียว)
-- ใช้ v_logs และตัวกรองเดือนเดียวกับ p4p_start_review / p4p_review_vote เพื่อให้ยอด "ค้างรับรอง" ตรงกัน
create or replace function public.p4p_committee_activity_status(p_month date)
returns table(person_id uuid, unit_id integer, pending integer, approved integer, rejected integer, draft integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare m date := date_trunc('month', p_month)::date;
begin
  if auth.uid() is null or not (public.my_role() = 'admin' or (public.my_role() = 'committee' and public.p4p_is_committee_member())) then
    raise exception 'ไม่มีสิทธิ์ตรวจสอบสถานะกิจกรรม P4P';
  end if;
  return query
  select v.person_id, v.unit_id,
         (count(*) filter (where v.status = 'pending'))::integer,
         (count(*) filter (where v.status = 'approved'))::integer,
         (count(*) filter (where v.status = 'rejected'))::integer,
         (count(*) filter (where v.status = 'draft'))::integer
  from public.v_logs v
  where v.month = m
  group by v.person_id, v.unit_id;
end;
$$;

revoke all on function public.p4p_committee_activity_status(date) from public, anon;
grant execute on function public.p4p_committee_activity_status(date) to authenticated;
