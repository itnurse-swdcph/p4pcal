import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "ระบบยังตั้งค่าไม่สมบูรณ์ กรุณาติดต่อผู้ดูแล" });
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }); }

  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const staffId = Number(body.staff_id);
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
    return json(400, { error: "ชื่อผู้ใช้ต้องยาว 3–30 ตัว และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง" });
  }
  if (password.length < 6) return json(400, { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
  if (!Number.isInteger(staffId) || staffId < 2) {
    const prefix = String(body.prefix ?? "").trim();
    const first = String(body.first_name ?? "").trim();
    const last = String(body.last_name ?? "").trim();
    const position = String(body.position ?? "").trim();
    const unitId = Number(body.unit_id);
    if (!prefix || !first || !last || !position || !Number.isInteger(unitId) || unitId < 1) return json(400, { error: "กรุณากรอกข้อมูลบุคลากรให้ครบถ้วน" });
    const legacyAdmin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: existingLegacy, error: lookupLegacyError } = await legacyAdmin.from("profiles").select("user_id").ilike("username", username).maybeSingle();
    if (lookupLegacyError) return json(500, { error: "ตรวจสอบชื่อผู้ใช้ไม่สำเร็จ กรุณาลองใหม่" });
    if (existingLegacy) return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });
    const { data: legacyUser, error: legacyCreateError } = await legacyAdmin.auth.admin.createUser({
      email: username + "@p4p.invalid", password, email_confirm: true,
      user_metadata: { prefix, first_name: first, last_name: last, position, unit_id: unitId }
    });
    if (legacyCreateError || !legacyUser.user) return json(400, { error: "สร้างบัญชีไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่" });
    const { error: legacyProfileError } = await legacyAdmin.from("profiles").update({ username }).eq("user_id", legacyUser.user.id);
    if (legacyProfileError) {
      await legacyAdmin.auth.admin.deleteUser(legacyUser.user.id);
      return json(500, { error: "บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่" });
    }
    return json(201, { success: true });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: staff, error: staffError } = await admin.from("staff_directory")
    .select("source_row,prefix,first_name,last_name,position,org_role,staff_group,staff_type,unit_name,extra_unit_names,nursing_group,extra_nursing_group_names,active")
    .eq("source_row", staffId).eq("active", true).maybeSingle();
  if (staffError) return json(500, { error: "ตรวจสอบข้อมูลบุคลากรไม่สำเร็จ" });
  if (!staff) { console.warn("p4p-register: staff directory record not found", { staffId }); return json(400, { error: "ไม่พบรายชื่อบุคลากรที่เลือกในฐานข้อมูล กรุณาค้นหาและเลือกชื่อใหม่" }); }

  const { data: linked, error: linkedError } = await admin.from("profiles")
    .select("user_id").eq("staff_directory_id", staffId).maybeSingle();
  if (linkedError) return json(500, { error: "ตรวจสอบสถานะบัญชีบุคลากรไม่สำเร็จ" });
  if (linked) return json(409, { error: "บุคลากรรายนี้มีบัญชีในระบบแล้ว กรุณาติดต่อผู้ดูแลหากต้องการกู้คืนบัญชี" });
  const { data: existing, error: lookupError } = await admin.from("profiles").select("user_id").ilike("username", username).maybeSingle();
  if (lookupError) return json(500, { error: "ตรวจสอบชื่อผู้ใช้ไม่สำเร็จ กรุณาลองใหม่" });
  if (existing) return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });

  const { data: unitRows, error: unitError } = await admin.from("units").select("id,name,parent_group").order("id");
  if (unitError) return json(500, { error: "โหลดข้อมูลหน่วยงานไม่สำเร็จ" });
  const units = unitRows || [];
  const aliases: Record<string, string> = {
    "งานการพยาบาลผู้ป่วยในพิเศษปาริฉัตร": "งานการพยาบาลผู้ป่วยในตึกปาริฉัตร",
    "งานการพยาบาลผู้ป่วยในพิเศษพวงชมพู": "งานการพยาบาลผู้ป่วยในตึกพวงชมพู",
    "งานการพยาบาลผู้ป่วยในสงฆ์อาพาธ": "งานการพยาบาลผู้ป่วยสงฆ์อาพาธ",
    "งานการพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย": "งานพยาบาลทารกแรกเกิดระยะวิกฤตและทารกป่วย",
    "งานการพยาบาลผู้ป่วยหนัก": "งานพยาบาลผู้ป่วยหนัก",
    "งานจ่ายกลาง": "หน่วยจ่ายกลาง",
    "งานการพยาบาลตรวจรักษาพิเศษ": "งานการพยาบาลเคมีบำบัด"
  };
  let unit = units.find((u: any) => u.name === staff.unit_name || u.name === aliases[staff.unit_name]);
  if (!unit) unit = units.find((u: any) => u.parent_group === staff.nursing_group);
  if (!unit) unit = units.find((u: any) => u.name === "กลุ่มการพยาบาล");
  if (!unit) return json(500, { error: "ไม่สามารถจับคู่หน่วยงานของบุคลากรกับระบบได้ กรุณาติดต่อผู้ดูแล" });

  // The acting chief nurse may still be listed as a group-work head in staff_directory.
  // Resolve the authoritative designation before creating the account so the profile update
  // below does not overwrite the admin role assigned by the auth trigger.
  const { data: designations, error: designationError } = await admin
    .from("position_designations")
    .select("full_name,position")
    .in("position", ["หัวหน้าพยาบาล", "รักษาการหัวหน้าพยาบาล"]);
  if (designationError) return json(500, { error: "ตรวจสอบตำแหน่งผู้ดูแลระบบไม่สำเร็จ กรุณาลองใหม่" });
  const normalizeName = (value: string) => value.normalize("NFC").toLowerCase().replace(/\\s+/g, "");
  const selectedFullName = [staff.prefix, staff.first_name, staff.last_name].filter(Boolean).join(" ");
  const isChiefNurse = (designations || []).some((d: any) =>
    normalizeName(String(d.full_name || "")) === normalizeName(selectedFullName)
  );
  const isLeader = staff.org_role === "หัวหน้างาน" || staff.org_role === "หัวหน้ากลุ่มงาน";
  const assignedRole = isChiefNurse ? "admin" : isLeader ? "head" : "staff";
  const email = username + "@p4p.invalid";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      prefix: staff.prefix, first_name: staff.first_name, last_name: staff.last_name,
      position: staff.position, unit_id: unit.id
    },
  });
  if (error || !data.user) {
    const message = error?.message ?? "";
    console.error("p4p-register auth.createUser failed", { code: error?.code, status: error?.status, message });
    if (/already|registered|exists/i.test(message)) return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });
    return json(400, { error: "Supabase Auth ปฏิเสธการสร้างบัญชี: " + (message || "ไม่ทราบสาเหตุ") });
  }

  const profileUpdate = await admin.from("profiles").update({
    username, staff_directory_id: staff.source_row,
    full_name: staff.prefix + staff.first_name + " " + staff.last_name,
    prefix: staff.prefix, first_name: staff.first_name, last_name: staff.last_name,
    position: staff.position, unit_id: unit.id, role: assignedRole,
    org_role: staff.org_role, staff_group: staff.staff_group, staff_type: staff.staff_type,
    nursing_group: staff.nursing_group, extra_unit_names: staff.extra_unit_names,
    extra_nursing_group_names: staff.extra_nursing_group_names
  }).eq("user_id", data.user.id);
  if (profileUpdate.error) {
    await admin.auth.admin.deleteUser(data.user.id);
    if (profileUpdate.error.code === "23505") return json(409, { error: "ชื่อผู้ใช้หรือรายชื่อบุคลากรถูกลงทะเบียนแล้ว" });
    return json(500, { error: "บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่" });
  }

  const extraNames = String(staff.extra_unit_names || "").split(/[;,，、]/).map((x: string) => x.trim()).filter(Boolean);
  let extraUnits = units.filter((u: any) => extraNames.includes(u.name) && u.id !== unit.id).map((u: any) => u.id);
  if (staff.org_role === "หัวหน้ากลุ่มงาน") {
    extraUnits = [...new Set([...extraUnits, ...units.filter((u: any) => u.parent_group === staff.nursing_group && u.id !== unit.id).map((u: any) => u.id)])];
  }
  if (extraUnits.length) {
    const { error: extraError } = await admin.from("profile_units").upsert(
      extraUnits.map((unit_id: number) => ({ user_id: data.user.id, unit_id, approved: true })),
      { onConflict: "user_id,unit_id" }
    );
    if (extraError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return json(500, { error: "กำหนดหน่วยงานเพิ่มเติมไม่สำเร็จ กรุณาลองใหม่" });
    }
  }
  return json(201, { success: true });
});
