-- ตำแหน่ง 'พนักงานบริการ' ถูกย้ายไปกลุ่มจ่ายเงิน 5 แล้ว (positions.pay_group = 5) แต่ชื่อกลุ่มยังระบุว่าอยู่กลุ่ม 4
-- ชื่อกลุ่มใช้แสดงในตารางของ คกก. P4P และหน้าตั้งค่า (กลุ่มวิชาชีพและยอดค่าตอบแทน)
-- Applied to production via MCP as: p4p_pay_group_names_move_service_staff_to_group5
update public.pay_groups set name = 'กลุ่ม 4 สายบริการอื่น (ผู้ช่วยเหลือคนไข้ พนักงานประจำตึก พนักงานเปล)' where id = 4;
update public.pay_groups set name = 'กลุ่ม 5 สายสนับสนุน (พนักงานธุรการ พนักงานบริการ ผู้ช่วยช่างทั่วไป)' where id = 5;
