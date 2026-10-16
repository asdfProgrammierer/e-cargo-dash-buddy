// deno-lint-ignore-file no-explicit-any
// Admin-Funktion: registriert den Shopify-Webhook `orders/fulfilled`, hinterlegt
// das App-Secret für die HMAC-Prüfung und setzt den Cutoff-Zeitpunkt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { normalizeShopDomain as normalizeDomain, settingsUpdate } from "./settings.ts";
import { z } from "npm:zod@4";

const SHOPIFY_API_VERSION = "2024-10";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Nur POST", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return new Response("Konfiguration fehlt", { status: 500, headers: corsHeaders });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Nur Admins
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Unauthorized" }, 401);
  const { data: roleRow } = await admin.from("user_roles").select("role")
    .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ error: "Nur Admins" }, 403);

  const parsed = z.object({
    connectionId: z.string().uuid(),
    appSecret: z.string().max(24576).optional(),
    shopDomain: z.string().max(255).optional(),
    action: z.enum(["status", "save", "register"]).optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ungültige Shop-Einstellungen" }, 400);
  const body = parsed.data;

  const { data: conn } = await admin.from("shop_connections")
    .select("id, api_key, api_url, shop_domain, platform, webhook_secret, webhook_cutoff_at")
    .eq("id", body.connectionId).maybeSingle();
  if (!conn || conn.platform !== "shopify") return json({ error: "Shopify-Verbindung nicht gefunden" }, 404);

  if (body.action === "save") {
    let update;
    try { update = settingsUpdate(body); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Ungültige Einstellungen" }, 400); }
    if (Object.keys(update).length === 0) return json({ error: "Keine Einstellungen angegeben" }, 400);
    const { data: saved, error } = await admin.from("shop_connections").update(update)
      .eq("id", conn.id).select("id, shop_domain").single();
    if (error || !saved) return json({ error: "Einstellungen konnten nicht gespeichert werden" }, 500);
    return json({ ok: true, shopDomain: saved.shop_domain, secretConfigured: Boolean(update.webhook_secret || conn.webhook_secret) });
  }

  const localStatus = {
    secretConfigured: Boolean(conn.webhook_secret),
    shopDomain: conn.shop_domain ?? conn.api_url,
    cutoff: conn.webhook_cutoff_at,
  };

  const domain = normalizeDomain(conn.shop_domain ?? conn.api_url);
  if (!domain || !conn.api_key) return json({ ...localStatus, error: "Shop-Domain oder Access Token fehlt" }, 400);

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
      ...localStatus,
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

  // Vorhandene Registrierung behalten; Erneuern darf keinen neuen Cutoff setzen.
  const listRes = await shopify(`/webhooks.json?topic=orders/fulfilled`);
  if (!listRes.ok) return json({ error: "Webhook-Status konnte nicht gelesen werden", status: listRes.status }, listRes.status);
  let existingWebhook = null;
  if (listRes.ok) {
    const list = await listRes.json() as { webhooks?: Array<{ id: number; address: string }> };
    for (const w of list.webhooks ?? []) {
      if (w.address === callbackUrl) {
        existingWebhook = w;
        break;
      }
    }
  }

  const createRes = existingWebhook ? null : await shopify(`/webhooks.json`, {
    method: "POST",
    body: JSON.stringify({ webhook: { topic: "orders/fulfilled", address: callbackUrl, format: "json" } }),
  });
  const createBody = createRes ? await createRes.text() : "{}";
  if (createRes && !createRes.ok) {
    return json({ error: "Registrierung fehlgeschlagen", status: createRes.status }, createRes.status);
  }

  const cutoff = conn.webhook_cutoff_at || new Date().toISOString();
  const { error: upErr } = await admin.from("shop_connections").update({
    webhook_secret: appSecret || conn.webhook_secret,
    webhook_cutoff_at: cutoff,
    poll_sync_enabled: false,
  }).eq("id", conn.id);
  if (upErr) return json({ error: "Speichern fehlgeschlagen", details: upErr.message }, 500);

  return json({ ok: true, secretConfigured: true, shopDomain: domain, callbackUrl, cutoff, webhook: existingWebhook ?? JSON.parse(createBody)?.webhook ?? null });
});
