-- ชุดกิจกรรม "พนักงานบริการ" = รวมกิจกรรมของผู้ช่วยเหลือคนไข้ (AID-001..061, AID-MED-062..065) + พนักงานประจำตึก (WARD-001..039)
-- ใช้รหัสเดิมตามไฟล์ P4P_พนักงานบริการ_2026-11-06_1.xlsx เพราะมีการบันทึกด้วยรหัสเหล่านี้ไปแล้ว
-- Applied to production via MCP as: p4p_service_staff_set_reuse_aid_ward_codes + p4p_service_staff_set_fix_eligible_order
-- 1) ลบชุด SVC-xxx ที่เพิ่มไว้ก่อนหน้า (ตรวจแล้วไม่มี logs อ้างอิง)
-- 2) เพิ่มสิทธิ์ 'พนักงานบริการ' และ 'พนักงานธุรการ' ให้ AID-% / WARD-% โดยคงสายงานหลักไว้เป็นลำดับแรก
do $$
begin
  if exists (select 1 from public.logs where activity_code like 'SVC-%') then
    raise exception 'มีรายการบันทึกใช้รหัส SVC แล้ว';
  end if;
  delete from public.activities where code like 'SVC-%';
end $$;

update public.activities set eligible = array['ผู้ช่วยเหลือคนไข้','พนักงานบริการ','พนักงานธุรการ'] where code like 'AID-%';
update public.activities set eligible = array['พนักงานประจำตึก','พนักงานบริการ','พนักงานธุรการ'] where code like 'WARD-%';
