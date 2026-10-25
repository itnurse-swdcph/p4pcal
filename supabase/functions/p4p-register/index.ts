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
  const prefix = String(body.prefix ?? "").trim();
  const first = String(body.first_name ?? "").trim();
  const last = String(body.last_name ?? "").trim();
  const position = String(body.position ?? "").trim();
  const unitId = Number(body.unit_id);

  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
    return json(400, { error: "ชื่อผู้ใช้ต้องยาว 3–30 ตัว และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง" });
  }
  if (password.length < 6) return json(400, { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
  if (!prefix || !first || !last || !position || !Number.isInteger(unitId) || unitId < 1) {
    return json(400, { error: "กรุณากรอกข้อมูลบุคลากรให้ครบถ้วน" });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: existing, error: lookupError } = await admin
    .from("profiles").select("user_id").ilike("username", username).maybeSingle();
  if (lookupError) return json(500, { error: "ตรวจสอบชื่อผู้ใช้ไม่สำเร็จ กรุณาลองใหม่" });
  if (existing) return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });

  const email = username + "@p4p.invalid";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { prefix, first_name: first, last_name: last, position, unit_id: unitId },
  });
  if (error || !data.user) {
    const message = error?.message ?? "";
    if (/already|registered|exists/i.test(message)) return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });
    return json(400, { error: "สร้างบัญชีไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่" });
  }

  const { error: profileError } = await admin.from("profiles")
    .update({ username }).eq("user_id", data.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    if (profileError.code === "23505") return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });
    return json(500, { error: "บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่" });
  }

  return json(201, { success: true });
});
