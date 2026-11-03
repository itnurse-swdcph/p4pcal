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
  if (!url || !serviceKey) return json(500, { error: "ระบบยังตั้งค่าไม่สมบูรณ์ กรุณาติดต่อผู้ดูแลระบบ" });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }); }
  const userId = String(body.user_id || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const password = body.password == null ? "" : String(body.password);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json(400, { error: "ไม่พบรหัสบัญชีผู้ใช้ที่ถูกต้อง" });
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
    return json(400, { error: "ชื่อผู้ใช้ต้องยาว 3–30 ตัว และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง" });
  }
  if (password && (password.length < 6 || password.length > 72)) {
    return json(400, { error: "รหัสผ่านใหม่ต้องมี 6–72 ตัวอักษร" });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });

  const { data: actor, error: actorError } = await admin
    .from("profiles").select("role").eq("user_id", authData.user.id).maybeSingle();
  if (actorError || actor?.role !== "admin") {
    return json(403, { error: "เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขบัญชีผู้อื่นได้" });
  }

  const { data: target, error: targetError } = await admin
    .from("profiles").select("user_id,username,full_name").eq("user_id", userId).maybeSingle();
  if (targetError) return json(500, { error: "ค้นหาบัญชีผู้ใช้ไม่สำเร็จ" });
  if (!target) return json(404, { error: "ไม่พบบัญชีผู้ใช้ที่ต้องการแก้ไข" });

  const { data: duplicate, error: duplicateError } = await admin
    .from("profiles").select("user_id").ilike("username", username).neq("user_id", userId).maybeSingle();
  if (duplicateError) return json(500, { error: "ตรวจสอบชื่อผู้ใช้ซ้ำไม่สำเร็จ" });
  if (duplicate) return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });

  const internalEmail = username + "@p4p.invalid";
  const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(userId);
  if (targetAuthError || !targetAuth?.user) return json(404, { error: "ไม่พบข้อมูล Auth ของบัญชีนี้" });

  const oldUsername = target.username || "";
  const usernameChanged = username !== oldUsername.toLowerCase();
  if (!usernameChanged && !password && (targetAuth.user.email || "").toLowerCase() === internalEmail) {
    return json(400, { error: "ไม่มีข้อมูลที่ต้องการเปลี่ยนแปลง" });
  }

  if (usernameChanged) {
    const { error: profileUpdateError } = await admin.from("profiles").update({ username }).eq("user_id", userId);
    if (profileUpdateError) {
      if (profileUpdateError.code === "23505") return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });
      console.error("p4p-admin-update-user profile update failed", profileUpdateError.message);
      return json(500, { error: "บันทึกชื่อผู้ใช้ไม่สำเร็จ" });
    }
  }

  const authPatch: Record<string, unknown> = {};
  if ((targetAuth.user.email || "").toLowerCase() !== internalEmail) {
    authPatch.email = internalEmail;
    authPatch.email_confirm = true;
  }
  if (password) authPatch.password = password;

  if (Object.keys(authPatch).length) {
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(userId, authPatch);
    if (updateAuthError) {
      if (usernameChanged) await admin.from("profiles").update({ username: oldUsername }).eq("user_id", userId);
      if (/already|registered|exists/i.test(updateAuthError.message || "")) {
        return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้กับบัญชีเข้าสู่ระบบอื่นแล้ว" });
      }
      console.error("p4p-admin-update-user auth update failed", updateAuthError.message);
      return json(400, { error: "เปลี่ยนข้อมูลเข้าสู่ระบบไม่สำเร็จ ระบบได้ยกเลิกการเปลี่ยนชื่อผู้ใช้แล้ว" });
    }
  }

  return json(200, {
    success: true,
    username,
    password_changed: Boolean(password),
    user_id: userId,
    full_name: target.full_name,
  });
});
