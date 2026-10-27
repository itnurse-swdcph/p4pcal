import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
Deno.serve(async (req: Request) => {
 if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
 if (req.method !== "POST") return json(405, { error: "Method not allowed" });
 const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if (!url || !serviceKey) return json(500, { error: "ระบบยังตั้งค่าไม่สมบูรณ์ กรุณาติดต่อผู้ดูแล" });
 let body: any; try { body = await req.json(); } catch { return json(400, { error: "ข้อมูลค้นหาไม่ถูกต้อง" }); }
 const q = String(body.q ?? "").trim().replace(/[,%()]/g, " ");
 if (q.length < 2) return json(200, { results: [] });
 const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
 const pattern = "%" + q + "%";
 const { data, error } = await admin.from("staff_directory").select("source_row,prefix,first_name,last_name,position,org_role,staff_group,staff_type,unit_name,extra_unit_names,nursing_group,extra_nursing_group_names").eq("active", true).or("first_name.ilike." + pattern + ",last_name.ilike." + pattern).order("first_name").limit(15);
 if (error) return json(500, { error: "ค้นหารายชื่อบุคลากรไม่สำเร็จ" });
 const { data: linked, error: linkedError } = await admin.from("profiles").select("staff_directory_id").not("staff_directory_id", "is", null);
 if (linkedError) return json(500, { error: "ตรวจสอบสถานะรายชื่อไม่สำเร็จ" });
 const used = new Set((linked || []).map((x: any) => x.staff_directory_id));
 return json(200, { results: (data || []).filter((x: any) => !used.has(x.source_row)) });
});