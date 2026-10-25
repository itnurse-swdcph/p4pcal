# P4Pcal – ระบบบันทึกกิจกรรมและคำนวณแต้ม P4P กลุ่มการพยาบาล

เว็บแอปสำหรับบันทึกกิจกรรมรายวัน คำนวณแต้ม และคิดค่าตอบแทน P4P รายหน่วยงาน ใช้ Supabase เป็นฐานข้อมูล

- `app/` – ซอร์สโค้ด (React + Vite + Tailwind) บันเดิลด้วย `scripts/bundle-artifact.sh` ของ web-artifacts-builder
- `docs/index.html` – ไฟล์ที่บันเดิลแล้ว (เสิร์ฟผ่าน GitHub Pages)
- `supabase/01_schema.sql`, `02_seed.sql` – ตาราง, RLS, view คำนวณแต้ม, ข้อมูลตำแหน่ง/กิจกรรม/หน่วยงาน

## บทบาท
เจ้าหน้าที่ (บันทึกของตนเอง) · หัวหน้างาน (บันทึกแทน/รับรอง/จัดการรายชื่อในหน่วย) · กรรมการ P4P (ตรวจสอบรายหน่วยงาน/รายบุคคล ตั้งงบ) · ผู้ดูแลระบบ (กำหนดสิทธิ์ผู้ใช้)

## ตั้งผู้ดูแลคนแรก
หลังลงทะเบียนในเว็บแล้ว รันใน Supabase SQL Editor:
`update profiles set role='admin' where user_id=(select id from auth.users where email='อีเมลของคุณ');`
