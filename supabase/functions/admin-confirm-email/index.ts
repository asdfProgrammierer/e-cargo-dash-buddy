import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Nicht authentifiziert" }, 401);

  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "Nicht authentifiziert" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Nur Admins erlaubt" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const userId = String(body.user_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Ungültige Nutzer-ID" }, 400);

  const action = body.action === "status" ? "status" : "confirm";
  const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !target.user) return json({ error: "Nutzer nicht gefunden" }, 404);
  if (action === "status") return json({ confirmed: !!target.user.email_confirmed_at });

  if (!target.user.email_confirmed_at) {
    const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) return json({ error: error.message }, 500);
  }
  await admin.from("admin_audit_log").insert({
    actor_user_id: u.user.id, actor_role: "admin", entity_type: "auth_user",
    entity_id: userId, action: "email_confirmed_manually",
  });
  return json({ ok: true, confirmed: true });
});
