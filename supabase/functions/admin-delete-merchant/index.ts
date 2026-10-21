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

  // Verify admin role
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "Nur Admins" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const profileId = String(body.profile_id ?? "");
  if (!profileId) return json({ error: "profile_id fehlt" }, 400);

  // Load merchant profile (must be a parent / non-sub-account)
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, user_id, parent_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (profErr || !profile) return json({ error: "Händler nicht gefunden" }, 404);
  if (profile.parent_user_id) return json({ error: "Sub-Accounts hier nicht löschen" }, 400);

  if (profile.user_id === userData.user.id) {
    return json({ error: "Eigenen Account nicht löschbar" }, 400);
  }

  const ownerId = profile.user_id;

  // Find sub-accounts
  const { data: subs } = await admin
    .from("profiles")
    .select("user_id")
    .eq("parent_user_id", ownerId);
  const subUserIds = (subs ?? []).map((s: any) => s.user_id);
  const allUserIds = [ownerId, ...subUserIds];

  // Child rows of orders (route_stops, history, delivery_instructions, gdpr tokens) cascade in the DB.
  // Storage artefacts are removed by the 2-month GDPR cleanup job; skip per-order loops (timeouts).
  const step = async (label: string, p: PromiseLike<{ error: any }>) => {
    const { error } = await p;
    if (error) throw new Error(`${label}: ${error.message}`);
  };

  try {
    await step("Push-Abos", admin.from("push_subscriptions").delete().in("user_id", allUserIds));
    await step("Benachrichtigungen gelesen", admin.from("notification_reads").delete().in("user_id", allUserIds));
    await step("Benachrichtigungen", admin.from("notifications").delete().in("target_user_id", allUserIds));
    await step("Adressbuch", admin.from("address_book").delete().in("user_id", allUserIds));
    await step("WMS-API-Keys", admin.from("wms_api_keys").delete().in("user_id", allUserIds));
    await step("DHL-Preise", admin.from("dhl_price_tiers").delete().in("user_id", allUserIds));
    await step("Aufträge", admin.from("orders").delete().in("user_id", allUserIds));
    await step("Shop-Verbindungen", admin.from("shop_connections").delete().in("user_id", allUserIds));
    await step("Rollen", admin.from("user_roles").delete().in("user_id", allUserIds));
    await step("Sub-Profile", admin.from("profiles").delete().in("user_id", subUserIds.length ? subUserIds : ["00000000-0000-0000-0000-000000000000"]));
    await step("Profil", admin.from("profiles").delete().eq("user_id", ownerId));
  } catch (e) {
    return json({ error: `Löschen fehlgeschlagen (${(e as Error).message})` }, 500);
  }

  for (const subId of subUserIds) {
    await admin.auth.admin.deleteUser(subId);
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(ownerId);
  if (delErr) return json({ error: `Login konnte nicht gelöscht werden: ${delErr.message}` }, 500);

  await admin.from("admin_audit_log").insert({
    actor_user_id: userData.user.id, actor_role: "admin", entity_type: "profile",
    entity_id: ownerId, action: "merchant_deleted", metadata: { sub_accounts: subUserIds.length },
  });

  return json({ ok: true });
});