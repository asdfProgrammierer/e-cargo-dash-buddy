// deno-lint-ignore-file no-explicit-any
// Admin-Funktion: registriert den Shopify-Webhook `orders/fulfilled`, hinterlegt
// das App-Secret für die HMAC-Prüfung und setzt den Cutoff-Zeitpunkt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHOPIFY_API_VERSION = "2024-10";

function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) return null;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Nur Admins
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Unauthorized" }, 401);
  const { data: roleRow } = await admin.from("user_roles").select("role")
    .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ error: "Nur Admins" }, 403);

  let body: { connectionId?: string; appSecret?: string; action?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  if (!body.connectionId) return json({ error: "connectionId erforderlich" }, 400);

  const { data: conn } = await admin.from("shop_connections")
    .select("id, api_key, api_url, shop_domain, platform, webhook_secret")
    .eq("id", body.connectionId).maybeSingle();
  if (!conn || conn.platform !== "shopify") return json({ error: "Shopify-Verbindung nicht gefunden" }, 404);

  const domain = normalizeDomain(conn.shop_domain ?? conn.api_url);
  if (!domain || !conn.api_key) return json({ error: "Shop-Domain oder Access Token fehlt" }, 400);

  const shopify = (path: string, init: RequestInit = {}) =>
    fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
      ...init,
      headers: {
        "X-Shopify-Access-Token": conn.api_key,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });

  const callbackUrl = `${supabaseUrl}/functions/v1/shopify-order-webhook`;

  if (body.action === "status") {
    const res = await shopify(`/webhooks.json?topic=orders/fulfilled`);
    const data = res.ok ? await res.json() : null;
    return json({
      ok: res.ok,
      callbackUrl,
      webhooks: data?.webhooks ?? [],
      status: res.status,
    });
  }

  const appSecret = (body.appSecret ?? "").trim();
  if (!appSecret && !conn.webhook_secret) {
    return json({ error: "App-Secret (API secret key) erforderlich für die Signaturprüfung" }, 400);
  }

  // Bestehende Registrierung auf dieselbe URL entfernen (idempotent)
  const listRes = await shopify(`/webhooks.json?topic=orders/fulfilled`);
  if (listRes.ok) {
    const list = await listRes.json() as { webhooks?: Array<{ id: number; address: string }> };
    for (const w of list.webhooks ?? []) {
      if (w.address === callbackUrl) {
        await shopify(`/webhooks/${w.id}.json`, { method: "DELETE" });
      }
    }
  }

  const createRes = await shopify(`/webhooks.json`, {
    method: "POST",
    body: JSON.stringify({ webhook: { topic: "orders/fulfilled", address: callbackUrl, format: "json" } }),
  });
  const createBody = await createRes.text();
  if (!createRes.ok) {
    console.error("Webhook-Registrierung fehlgeschlagen", createRes.status, createBody.slice(0, 400));
    return json({ error: "Registrierung fehlgeschlagen", status: createRes.status, details: createBody.slice(0, 400) }, createRes.status);
  }

  const cutoff = new Date().toISOString();
  const { error: upErr } = await admin.from("shop_connections").update({
    webhook_secret: appSecret || conn.webhook_secret,
    webhook_cutoff_at: cutoff,
    poll_sync_enabled: false,
  }).eq("id", conn.id);
  if (upErr) return json({ error: "Speichern fehlgeschlagen", details: upErr.message }, 500);

  return json({ ok: true, callbackUrl, cutoff, webhook: JSON.parse(createBody)?.webhook ?? null });
});
