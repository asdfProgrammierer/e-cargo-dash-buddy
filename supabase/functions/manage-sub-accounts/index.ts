import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_SUB_ACCOUNTS = 2;

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
  const parentUserId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Ensure caller is a parent merchant (not itself a sub-account)
  const { data: parentProfile } = await admin
    .from("profiles")
    .select("id, parent_user_id, approved")
    .eq("user_id", parentUserId)
    .maybeSingle();
  if (!parentProfile) return json({ error: "Profil nicht gefunden" }, 404);
  if (parentProfile.parent_user_id) {
    return json({ error: "Sub-Accounts können keine weiteren Sub-Accounts anlegen" }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty for list */ }
  const action = body.action ?? "list";

  if (action === "list") {
    const { data, error } = await admin
      .from("profiles")
      .select("id, user_id, ansprechpartner, created_at")
      .eq("parent_user_id", parentUserId)
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);

    const enriched = await Promise.all((data ?? []).map(async (row) => {
      const { data: u } = await admin.auth.admin.getUserById(row.user_id);
      return { id: row.id, user_id: row.user_id, ansprechpartner: row.ansprechpartner, email: u.user?.email ?? null, created_at: row.created_at };
    }));
    return json({ subAccounts: enriched, max: MAX_SUB_ACCOUNTS });
  }

  if (action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Ungültige E-Mail" }, 400);
    if (password.length < 8) return json({ error: "Passwort muss mindestens 8 Zeichen haben" }, 400);
    if (!name) return json({ error: "Name erforderlich" }, 400);

    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("parent_user_id", parentUserId);
    if ((count ?? 0) >= MAX_SUB_ACCOUNTS) {
      return json({ error: `Maximal ${MAX_SUB_ACCOUNTS} Sub-Accounts erlaubt` }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, parent_user_id: parentUserId },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? "Konto konnte nicht erstellt werden" }, 400);
    }

    // handle_new_user trigger created the profile; update it as sub-account.
    const { error: updErr } = await admin
      .from("profiles")
      .update({ parent_user_id: parentUserId, approved: true, ansprechpartner: name })
      .eq("user_id", created.user.id);
    if (updErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: updErr.message }, 500);
    }
    return json({ ok: true, user_id: created.user.id });
  }

  if (action === "delete") {
    const subUserId = String(body.user_id ?? "");
    if (!subUserId) return json({ error: "user_id fehlt" }, 400);

    const { data: sub } = await admin
      .from("profiles")
      .select("user_id, parent_user_id")
      .eq("user_id", subUserId)
      .maybeSingle();
    if (!sub || sub.parent_user_id !== parentUserId) {
      return json({ error: "Nicht erlaubt" }, 403);
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(subUserId);
    if (delErr) return json({ error: delErr.message }, 500);
    await admin.from("profiles").delete().eq("user_id", subUserId);
    return json({ ok: true });
  }

  return json({ error: "Unbekannte Aktion" }, 400);
});