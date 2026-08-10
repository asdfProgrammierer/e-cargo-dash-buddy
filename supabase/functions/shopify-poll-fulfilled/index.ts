// deno-lint-ignore-file no-explicit-any
//
// Shopify -> e-cargo connect: API-Poll alle 5 Minuten.
//
// Holt ausschliesslich NEU fulfillte Bestellungen (updated_at_min = Wasserzeichen,
// nie vor dem Cutoff) und uebertraegt sie ueber die REST-API der Routenplanung
// (`wms-create-shipment`). Kein Backfill von Alt-Bestellungen: das Wasserzeichen
// startet beim Cutoff-Zeitpunkt und wandert nur vorwaerts.
//
// Klassifizierung Online vs. Vor-Ort identisch zum Webhook-Pfad:
//   1. source_name in shop_connections.pos_source_names -> verwerfen
//   2. keine shipping_address                            -> verwerfen
//   3. Liefergebiet/PLZ prueft die Routenplanungs-API
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHOPIFY_API_VERSION = "2024-10";
const DEFAULT_POS_SOURCE_NAMES = ["pos", "shopify_pos"];
// Ueberlappung, damit keine Bestellung zwischen zwei Laeufen verloren geht.
const OVERLAP_MS = 5 * 60 * 1000;

function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) return null;
  return d;
}

async function logEvent(admin: any, row: Record<string, unknown>) {
  try {
    await admin.from("shopify_webhook_log").insert(row);
  } catch (e) {
    console.error("log insert failed", e);
  }
}

async function importOrder(admin: any, conn: any, merchantCode: string, order: any, wmsKey: string) {
  const externalId = String(order.id);
  const orderName = order?.name ? String(order.name) : `#${externalId}`;
  const sourceName = order?.source_name ? String(order.source_name) : null;
  const base = {
    connection_id: conn.id,
    topic: "poll/fulfilled",
    external_order_ref: externalId,
    external_order_name: orderName,
    source_name: sourceName,
  };

  const posList: string[] = Array.isArray(conn.pos_source_names) && conn.pos_source_names.length
    ? conn.pos_source_names
    : DEFAULT_POS_SOURCE_NAMES;
  if (sourceName && posList.includes(sourceName.toLowerCase())) {
    await logEvent(admin, { ...base, decision: "discarded", reason: `Vor-Ort-Verkauf (source_name=${sourceName})` });
    return "discarded";
  }

  const ship = order.shipping_address ?? null;
  if (!ship) {
    await logEvent(admin, { ...base, decision: "discarded", reason: "keine Lieferadresse (Vor-Ort-Mitnahme/Abholung)" });
    return "discarded";
  }

  // Idempotenz
  const { data: existing } = await admin
    .from("orders")
    .select("id, auftrags_nr")
    .eq("shop_connection_id", conn.id)
    .eq("external_order_ref", externalId)
    .maybeSingle();
  if (existing) return "duplicate";

  const firstName = String(ship.first_name ?? order.customer?.first_name ?? "").trim();
  const lastName = String(ship.last_name ?? order.customer?.last_name ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim()
    || String(ship.name ?? "").trim()
    || String(ship.company ?? "").trim()
    || "Empfänger";
  const street = [ship.address1, ship.address2].filter(Boolean).join(" ").trim();
  const phone = String(ship.phone ?? order.phone ?? order.customer?.phone ?? "").trim();
  const email = String(order.email ?? order.contact_email ?? order.customer?.email ?? "").trim();

  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  let pakete = 0;
  let gramm = 0;
  for (const li of lineItems) {
    const qty = Number(li.quantity ?? 0);
    pakete += qty;
    gramm += Number(li.grams ?? 0) * qty;
  }
  if (!pakete || pakete < 1) pakete = 1;
  const gewicht = gramm > 0 ? Math.max(0.1, +(gramm / 1000).toFixed(2)) : 1;

  const notesParts = [`[Shopify ${orderName}]`, `Kanal: ${sourceName ?? "unbekannt"}`];
  if (!phone) notesParts.push("Hinweis: keine Telefonnummer im Shop hinterlegt");
  if (order.note) notesParts.push(String(order.note));

  const payload = {
    merchant_reference: merchantCode,
    external_order_ref: `shopify:${conn.id}:${externalId}`,
    recipient: {
      name: fullName,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      street,
      postal_code: String(ship.zip ?? "").trim(),
      city: String(ship.city ?? "").trim(),
      country: String(ship.country_code ?? "DE").toUpperCase(),
      email: email || undefined,
      phone: phone || undefined,
    },
    package: { count: pakete, weight_kg: gewicht },
    notes: notesParts.join("\n"),
  };

  const apiRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wms-create-shipment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-wms-api-key": wmsKey },
    body: JSON.stringify(payload),
  });
  const apiBody = await apiRes.text();

  if (!apiRes.ok) {
    const code = (() => { try { return JSON.parse(apiBody)?.error?.code; } catch { return null; } })();
    if (code === "OUT_OF_COVERAGE" || code === "VALIDATION_ERROR" || code === "UNKNOWN_MERCHANT") {
      await logEvent(admin, { ...base, decision: "discarded", reason: `${code}: ${apiBody.slice(0, 300)}` });
      return "discarded";
    }
    if (code === "DUPLICATE_REFERENCE_CONFLICT") {
      await logEvent(admin, { ...base, decision: "duplicate", reason: apiBody.slice(0, 300) });
      return "duplicate";
    }
    await logEvent(admin, { ...base, decision: "error", error: `API ${apiRes.status}: ${apiBody.slice(0, 400)}` });
    // Fehler -> Wasserzeichen darf nicht ueber diese Bestellung hinauswandern.
    throw new Error(`wms-create-shipment ${apiRes.status}: ${apiBody.slice(0, 300)}`);
  }

  const created = JSON.parse(apiBody);
  await admin.from("orders").update({
    shop_connection_id: conn.id,
    external_order_ref: externalId,
    external_order_name: orderName,
  }).eq("id", created.shipment_id);

  await logEvent(admin, { ...base, decision: "imported", reason: created.tracking_number });
  return "imported";
}

async function pollConnection(admin: any, conn: any, wmsKey: string) {
  const domain = normalizeDomain(conn.shop_domain ?? conn.api_url);
  if (!domain) return { connectionId: conn.id, error: "Shop-Domain fehlt" };
  if (!conn.api_key) return { connectionId: conn.id, error: "Access Token fehlt" };

  const { data: profile } = await admin
    .from("profiles").select("merchant_code").eq("user_id", conn.user_id).maybeSingle();
  if (!profile?.merchant_code) return { connectionId: conn.id, error: "Händlercode fehlt" };

  const cutoffMs = conn.webhook_cutoff_at ? new Date(conn.webhook_cutoff_at).getTime() : Date.now();
  const watermarkMs = conn.poll_watermark_at ? new Date(conn.poll_watermark_at).getTime() : cutoffMs;
  // Nie vor dem Cutoff pollen -> kein Alt-Bestand.
  const sinceMs = Math.max(cutoffMs, watermarkMs - OVERLAP_MS);
  const runStartedAt = new Date();

  const params = new URLSearchParams({
    status: "any",
    fulfillment_status: "shipped",
    updated_at_min: new Date(sinceMs).toISOString(),
    limit: "100",
    order: "updated_at asc",
  });

  const res = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?${params.toString()}`,
    { headers: { "X-Shopify-Access-Token": conn.api_key, Accept: "application/json" } },
  );
  if (!res.ok) {
    const body = await res.text();
    const err = `Shopify API ${res.status}: ${body.slice(0, 300)}`;
    await admin.from("shop_connections").update({
      last_sync_at: runStartedAt.toISOString(), last_sync_status: "error", last_sync_error: err,
    }).eq("id", conn.id);
    return { connectionId: conn.id, error: err };
  }

  const json = await res.json();
  const orders: any[] = json.orders ?? [];
  let imported = 0, discarded = 0, duplicate = 0;
  let failed: string | null = null;

  for (const o of orders) {
    // Zusaetzliche Sicherung: nur echte fulfilled-Bestellungen nach Cutoff
    if (String(o.fulfillment_status ?? "") !== "fulfilled") { discarded++; continue; }
    const stamp = new Date(o.updated_at ?? o.created_at ?? 0).getTime();
    if (!Number.isFinite(stamp) || stamp < cutoffMs) { discarded++; continue; }
    try {
      const r = await importOrder(admin, conn, profile.merchant_code, o, wmsKey);
      if (r === "imported") imported++;
      else if (r === "duplicate") duplicate++;
      else discarded++;
    } catch (e) {
      // Technischer Fehler: Lauf abbrechen, Wasserzeichen NICHT vorruecken,
      // damit der naechste Lauf in 5 Minuten erneut versucht.
      failed = String(e);
      break;
    }
  }

  await admin.from("shop_connections").update({
    last_sync_at: runStartedAt.toISOString(),
    last_sync_status: failed ? "error" : "ok",
    last_sync_error: failed,
    ...(failed ? {} : { poll_watermark_at: runStartedAt.toISOString() }),
  }).eq("id", conn.id);

  return { connectionId: conn.id, fetched: orders.length, imported, duplicate, discarded, error: failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Auth: service_role (Cron) oder Admin-JWT
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  let authorized = token !== "" && token === serviceKey;
  if (!authorized && token) {
    // Cron nutzt den im Vault hinterlegten Service-Key
    try {
      const { data: vaultRow } = await admin
        .schema("vault").from("decrypted_secrets")
        .select("decrypted_secret").eq("name", "email_queue_service_role_key").maybeSingle();
      if (vaultRow?.decrypted_secret && vaultRow.decrypted_secret === token) authorized = true;
    } catch (_e) { /* ignore */ }
  }
  if (!authorized && token) {
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role")
        .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      if (roleRow) authorized = true;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const wmsKey = Deno.env.get("WMS_API_KEY") ?? "";
  if (!wmsKey) {
    return new Response(JSON.stringify({ ok: false, error: "WMS_API_KEY fehlt" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { connectionId?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  let query = admin
    .from("shop_connections")
    .select("id, user_id, api_key, api_url, shop_domain, pos_source_names, webhook_cutoff_at, poll_watermark_at")
    .eq("platform", "shopify")
    .eq("active", true);
  if (body.connectionId) query = query.eq("id", body.connectionId);
  else query = query.eq("poll_sync_enabled", true);

  const { data: connections, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error.message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const conn of connections ?? []) {
    try {
      results.push(await pollConnection(admin, conn, wmsKey));
    } catch (e) {
      console.error("poll error", conn.id, e);
      results.push({ connectionId: conn.id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
