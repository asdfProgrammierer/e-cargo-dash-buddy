import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Nicht authentifiziert" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Nicht authentifiziert" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: isAdminData } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdminData) return json({ error: "Nur Admins erlaubt" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action ?? "list";

  if (action === "list") {
    const { data: roles, error } = await admin
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    const enriched = await Promise.all((roles ?? []).map(async (r) => {
      const { data: u } = await admin.auth.admin.getUserById(r.user_id);
      return { user_id: r.user_id, email: u.user?.email ?? null, created_at: r.created_at };
    }));
    return json({ admins: enriched });
  }

  if (action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim() || email;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Ungültige E-Mail" }, 400);
    if (password.length < 8) return json({ error: "Passwort muss mindestens 8 Zeichen haben" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? "Konto konnte nicht erstellt werden" }, 400);
    }

    await admin.from("profiles").update({ approved: true }).eq("user_id", created.user.id);

    const { error: roleErr } = await admin.from("user_roles").insert({
      user_id: created.user.id,
      role: "admin",
    });
    if (roleErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: roleErr.message }, 500);
    }
    return json({ ok: true, user_id: created.user.id });
  }

  if (action === "delete") {
    const targetUserId = String(body.user_id ?? "");
    if (!targetUserId) return json({ error: "user_id fehlt" }, 400);
    if (targetUserId === userData.user.id) return json({ error: "Eigenen Account nicht löschbar" }, 400);
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) return json({ error: delErr.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unbekannte Aktion" }, 400);
});