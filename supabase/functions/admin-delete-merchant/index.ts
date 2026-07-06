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

  // Collect order IDs so we can clear child rows that FK to orders (route_stops, etc.)
  const { data: ownerOrders } = await admin
    .from("orders")
    .select("id, tracking_token, dhl_label_url")
    .eq("user_id", ownerId);
  const orderIds = (ownerOrders ?? []).map((o: any) => o.id);

  // Storage cleanup: delivery-signatures / delivery-notes / delivery-photos are keyed by order id
  const buckets = ["delivery-signatures", "delivery-notes", "delivery-photos"];
  for (const bucket of buckets) {
    for (const orderId of orderIds) {
      const { data: files } = await admin.storage.from(bucket).list(orderId, { limit: 1000 });
      if (files && files.length > 0) {
        await admin.storage.from(bucket).remove(files.map((f) => `${orderId}/${f.name}`));
      }
    }
  }

  // Push subscriptions and notification reads for owner + sub-accounts
  await admin.from("push_subscriptions").delete().in("user_id", allUserIds);
  await admin.from("email_unsubscribe_tokens").delete().in("user_id", allUserIds).catch(() => {});

  // Route stops that reference this merchant's orders
  if (orderIds.length > 0) {
    await admin.from("route_stops").delete().in("order_id", orderIds);
  }

  // Delete dependent data owned by merchant
  await admin.from("address_book").delete().eq("user_id", ownerId);
  await admin.from("shop_connections").delete().eq("user_id", ownerId);
  await admin.from("order_status_history").delete().eq("user_id", ownerId);
  await admin.from("orders").delete().eq("user_id", ownerId);
  await admin.from("notifications").delete().eq("target_user_id", ownerId);
  await admin.from("notification_reads").delete().in("user_id", allUserIds);
  await admin.from("user_roles").delete().in("user_id", allUserIds);

  // Delete sub-account profiles + auth users
  for (const subId of subUserIds) {
    await admin.from("profiles").delete().eq("user_id", subId);
    await admin.auth.admin.deleteUser(subId).catch(() => {});
  }

  // Delete main profile + auth user
  await admin.from("profiles").delete().eq("user_id", ownerId);
  const { error: delErr } = await admin.auth.admin.deleteUser(ownerId);
  if (delErr) return json({ error: delErr.message }, 500);

  return json({ ok: true });
});