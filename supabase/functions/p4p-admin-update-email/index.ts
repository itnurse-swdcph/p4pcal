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

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "").trim();
  if (!token) return json(401, { error: "กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }); }
  const username = String(body.username || "").trim().toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) return json(400, { error: "ชื่อผู้ใช้ไม่ถูกต้อง" });
  if (email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return json(400, { error: "รูปแบบอีเมลไม่ถูกต้อง" });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });

  const { data: actor, error: actorError } = await admin
    .from("profiles").select("role").eq("user_id", authData.user.id).maybeSingle();
  if (actorError || actor?.role !== "admin") return json(403, { error: "เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนอีเมลบัญชีผู้อื่นได้" });

  const { data: target, error: targetError } = await admin
    .from("profiles").select("user_id,username,full_name").ilike("username", username).maybeSingle();
  if (targetError) return json(500, { error: "ค้นหาบัญชีผู้ใช้ไม่สำเร็จ" });
  if (!target?.user_id) return json(404, { error: "ไม่พบบัญชีผู้ใช้ชื่อนี้" });

  const { data: currentAuth, error: currentError } = await admin.auth.admin.getUserById(target.user_id);
  if (currentError || !currentAuth?.user) return json(404, { error: "ไม่พบข้อมูลบัญชีเข้าสู่ระบบของผู้ใช้นี้" });
  if ((currentAuth.user.email || "").toLowerCase() === email) {
    return json(200, { success: true, unchanged: true, username, email });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(target.user_id, {
    email,
    email_confirm: true,
  });
  if (updateError) {
    if (/already|registered|exists/i.test(updateError.message || "")) {
      return json(409, { error: "อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว" });
    }
    console.error("p4p-admin-update-email failed", updateError.message);
    return json(400, { error: "เปลี่ยนอีเมลไม่สำเร็จ กรุณาตรวจสอบอีเมลและลองใหม่" });
  }

  return json(200, {
    success: true,
    username,
    email,
    user_id: target.user_id,
    full_name: target.full_name,
  });
});
