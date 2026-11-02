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
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง" });
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }); }
  const username = String(body.username || "").trim().toLowerCase();
  const currentPassword = String(body.current_password || "");
  const newPassword = body.new_password == null ? "" : String(body.new_password);
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) return json(400, { error: "ชื่อผู้ใช้ต้องยาว 3–30 ตัว และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง" });
  if (!currentPassword) return json(400, { error: "กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน" });
  if (newPassword && newPassword.length < 6) return json(400, { error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร" });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json(401, { error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
  const { data: profile, error: profileError } = await admin.from("profiles").select("username,role").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile) return json(404, { error: "ไม่พบข้อมูลบัญชีผู้ใช้ในระบบ" });
  const oldEmail = String(user.email || "");
  const oldUsername = String(profile.username || oldEmail.replace(/@p4p\.invalid$/i, ""));
  const newEmail = username + "@p4p.invalid";
  const usernameChanged = username !== oldUsername.toLowerCase();
  if (!usernameChanged && !newPassword) return json(400, { error: "ไม่มีข้อมูลที่ต้องการเปลี่ยนแปลง" });
  const { error: verifyError } = await admin.auth.signInWithPassword({ email: oldEmail, password: currentPassword });
  if (verifyError) return json(403, { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
  if (usernameChanged) {
    const { data: duplicate, error: duplicateError } = await admin.from("profiles").select("user_id").ilike("username", username).neq("user_id", user.id).maybeSingle();
    if (duplicateError) return json(500, { error: "ตรวจสอบชื่อผู้ใช้ไม่สำเร็จ กรุณาลองใหม่" });
    if (duplicate) return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });
  }
  const attributes: Record<string, unknown> = {};
  if (usernameChanged) { attributes.email = newEmail; attributes.email_confirm = true; }
  if (newPassword) attributes.password = newPassword;
  const { error: updateAuthError } = await admin.auth.admin.updateUserById(user.id, attributes);
  if (updateAuthError) {
    if (/already|registered|exists/i.test(updateAuthError.message || "")) return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });
    console.error("p4p-update-credentials auth update failed", updateAuthError.message);
    return json(400, { error: "ปรับปรุงข้อมูลเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่" });
  }
  if (usernameChanged) {
    const { error: profileUpdateError } = await admin.from("profiles").update({ username }).eq("user_id", user.id);
    if (profileUpdateError) {
      await admin.auth.admin.updateUserById(user.id, { email: oldEmail, email_confirm: true, ...(newPassword ? { password: currentPassword } : {}) });
      if (profileUpdateError.code === "23505") return json(409, { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });
      console.error("p4p-update-credentials profile update failed", profileUpdateError.message);
      return json(500, { error: "บันทึกชื่อผู้ใช้ไม่สำเร็จ ระบบได้ยกเลิกการเปลี่ยนแปลงแล้ว" });
    }
  }
  return json(200, { success: true, username });
});
