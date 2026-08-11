// deno-lint-ignore-file no-explicit-any
//
// Shopify -> e-cargo connect: Auftragsübernahme beim Fulfillment.
//
// Trigger: Shopify Webhook-Topics `orders/fulfilled` (primär) und `orders/updated`
// (Fallback, nur wenn fulfillment_status === "fulfilled"). Webhooks feuern
// ausschliesslich bei zukünftigen Statuswechseln -> kein Alt-Bestand.
//
// Übertragung erfolgt NICHT per direktem DB-Insert, sondern über die öffentliche
// REST-API der Routenplanung (`wms-create-shipment`, Header `x-wms-api-key`).
// Dadurch gelten dieselben Validierungen, Liefergebiets-Checks, Idempotenz und
// Etikettenerzeugung wie für jedes andere angebundene System.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain, x-shopify-webhook-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHOPIFY_API_VERSION = "2024-10";

/**
 * UNTERSCHEIDUNG ONLINE- vs. VOR-ORT-VERKAUF
 * ------------------------------------------
 * Geprüft an echten Order-Daten dieses Shops (Stand 2026-08, 22 Bestellungen):
 *   source_name = "web"                 -> Online-Checkout            (8)
 *   source_name = "shopify_draft_order" -> manuell im Backend angelegt (14)
 *   source_name = "pos" / "shopify_pos" -> im Shop nicht vorhanden, laut Shopify
 *                                          der Wert für Kassenverkäufe (ANNAHME,
 *                                          konnte mangels POS-Bestellungen nicht
 *                                          empirisch verifiziert werden)
 *
 * Regel (Blacklist statt Whitelist, damit neue Kanäle wie Instagram/Google nicht
 * stillschweigend verloren gehen):
 *   1. source_name in POS-Liste (konfigurierbar je Verbindung über
 *      shop_connections.pos_source_names)                       -> verwerfen
 *   2. keine shipping_address                                    -> verwerfen
 *      (Mitnahme vor Ort hat prinzipbedingt keine Lieferadresse; das ist das
 *       eigentlich belastbare Kriterium und funktioniert kanalunabhängig)
 *   3. Liefergebiets-/PLZ-Prüfung übernimmt die Routenplanungs-API.
 */
const DEFAULT_POS_SOURCE_NAMES = ["pos", "shopify_pos"];

function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) return null;
  return d;
}

async function hmacBase64(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, body);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function logEvent(admin: any, row: Record<string, unknown>) {
  try {
    await admin.from("shopify_webhook_log").insert(row);
  } catch (e) {
    console.error("webhook log insert failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Nur POST" }), { status: 405, headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shopDomainHeader = normalizeDomain(req.headers.get("x-shopify-shop-domain"));
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const rawBody = new Uint8Array(await req.arrayBuffer());

  if (!shopDomainHeader) {
    return new Response(JSON.stringify({ error: "Unbekannte Shop-Domain" }), { status: 401, headers: corsHeaders });
  }

  // Verbindung anhand der Shop-Domain auflösen
  const { data: conns } = await admin
    .from("shop_connections")
    .select("id, user_id, api_key, api_url, shop_domain, active, webhook_secret, webhook_cutoff_at, pos_source_names")
    .eq("platform", "shopify")
    .eq("active", true);
  const conn = (conns ?? []).find((c: any) => normalizeDomain(c.shop_domain ?? c.api_url) === shopDomainHeader);

  if (!conn) {
    console.warn("Webhook für unbekannte/inaktive Verbindung", shopDomainHeader);
    return new Response(JSON.stringify({ error: "Keine aktive Verbindung" }), { status: 401, headers: corsHeaders });
  }

  // HMAC-Prüfung (fail closed): ohne hinterlegtes App-Secret wird nichts verarbeitet.
  if (!conn.webhook_secret) {
    await logEvent(admin, { connection_id: conn.id, topic, decision: "rejected", reason: "webhook_secret fehlt" });
    return new Response(JSON.stringify({ error: "Webhook-Secret nicht konfiguriert" }), { status: 401, headers: corsHeaders });
  }
  const expected = await hmacBase64(conn.webhook_secret, rawBody);
  if (!timingSafeEqual(expected, hmacHeader)) {
    await logEvent(admin, { connection_id: conn.id, topic, decision: "rejected", reason: "HMAC ungültig" });
    return new Response(JSON.stringify({ error: "Signatur ungültig" }), { status: 401, headers: corsHeaders });
  }

  let order: any;
  try {
    order = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response(JSON.stringify({ error: "Ungültiges JSON" }), { status: 400, headers: corsHeaders });
  }

  const externalId = order?.id != null ? String(order.id) : null;
  const orderName = order?.name ? String(order.name) : externalId ? `#${externalId}` : null;
  const sourceName = order?.source_name ? String(order.source_name) : null;
  const base = {
    connection_id: conn.id, topic,
    external_order_ref: externalId,
    external_order_name: orderName,
    source_name: sourceName,
  };

  const discard = async (reason: string) => {
    console.log("Shopify-Webhook verworfen", { ...base, reason });
    await logEvent(admin, { ...base, decision: "discarded", reason });
    // 200, damit Shopify nicht endlos wiederholt – bewusste fachliche Entscheidung.
    return new Response(JSON.stringify({ ok: true, discarded: reason }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  if (!externalId) return await discard("Order-ID fehlt");

  // 1. Fulfillment-Status
  if (topic !== "orders/fulfilled" && String(order.fulfillment_status ?? "") !== "fulfilled") {
    return await discard(`Status nicht fulfilled (${order.fulfillment_status ?? "null"})`);
  }

  // 2. Cutoff – Schutz gegen Replays/Backfills von Alt-Bestellungen
  const cutoff = conn.webhook_cutoff_at ? new Date(conn.webhook_cutoff_at).getTime() : null;
  if (cutoff) {
    const stamp = new Date(order.updated_at ?? order.created_at ?? 0).getTime();
    if (!Number.isFinite(stamp) || stamp < cutoff) {
      return await discard(`vor Cutoff (${conn.webhook_cutoff_at})`);
    }
  }

  // 3. Vor-Ort-Verkauf ausschliessen (siehe Regel oben)
  const posList: string[] = Array.isArray(conn.pos_source_names) && conn.pos_source_names.length
    ? conn.pos_source_names
    : DEFAULT_POS_SOURCE_NAMES;
  if (sourceName && posList.includes(sourceName.toLowerCase())) {
    return await discard(`Vor-Ort-Verkauf (source_name=${sourceName})`);
  }

  // 4. Lieferadresse erforderlich
  let ship = order.shipping_address ?? null;

  // Ergänzende Details nachladen, falls der Payload unvollständig ist
  if (!ship || !order.email) {
    const domain = normalizeDomain(conn.shop_domain ?? conn.api_url);
    if (domain && conn.api_key) {
      try {
        const res = await fetch(
          `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders/${externalId}.json`,
          { headers: { "X-Shopify-Access-Token": conn.api_key, Accept: "application/json" } },
        );
        if (res.ok) {
          const full = await res.json();
          order = { ...order, ...(full.order ?? {}) };
          ship = order.shipping_address ?? ship;
        } else {
          console.warn("Order-Nachladen fehlgeschlagen", externalId, res.status);
        }
      } catch (e) {
        console.warn("Order-Nachladen Fehler", externalId, e);
      }
    }
  }

  if (!ship) return await discard("keine Lieferadresse (Vor-Ort-Mitnahme/Abholung)");

  // 5. Idempotenz: bereits übernommen?
  const { data: existing } = await admin
    .from("orders")
    .select("id, auftrags_nr")
    .eq("shop_connection_id", conn.id)
    .eq("external_order_ref", externalId)
    .maybeSingle();
  if (existing) {
    await logEvent(admin, { ...base, decision: "duplicate", reason: `bereits übernommen als ${existing.auftrags_nr}` });
    return new Response(JSON.stringify({ ok: true, duplicate: true, tracking_number: existing.auftrags_nr }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 6. Händlercode für den API-Call
  const { data: profile } = await admin
    .from("profiles")
    .select("merchant_code, firma_name, ansprechpartner, strasse, plz, stadt")
    .eq("user_id", conn.user_id)
    .maybeSingle();
  if (!profile?.merchant_code) {
    await logEvent(admin, { ...base, decision: "error", error: "Händlercode fehlt" });
    return new Response(JSON.stringify({ error: "Händlercode fehlt" }), { status: 500, headers: corsHeaders });
  }

  // Vor-/Nachname getrennt, falls Shopify sie getrennt liefert
  const firstName = String(ship.first_name ?? order.customer?.first_name ?? "").trim();
  const lastName = String(ship.last_name ?? order.customer?.last_name ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim()
    || String(ship.name ?? "").trim()
    || String(ship.company ?? "").trim()
    || "Empfänger";
  const street = [ship.address1, ship.address2].filter(Boolean).join(" ").trim();
  // Telefonnummer ist bei Shopify optional; wir übertragen sie leer statt abzubrechen.
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

  const wmsKey = Deno.env.get("WMS_API_KEY") ?? "";
  if (!wmsKey) {
    await logEvent(admin, { ...base, decision: "error", error: "WMS_API_KEY nicht konfiguriert" });
    return new Response(JSON.stringify({ error: "WMS_API_KEY fehlt" }), { status: 500, headers: corsHeaders });
  }

  const payload = {
    merchant_reference: profile.merchant_code,
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
  };

  // 7. Übertragung an die Routenplanung über deren REST-API
  const apiRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wms-create-shipment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-wms-api-key": wmsKey },
    body: JSON.stringify(payload),
  });
  const apiBody = await apiRes.text();

  if (!apiRes.ok) {
    const code = (() => { try { return JSON.parse(apiBody)?.error?.code; } catch { return null; } })();
    // Fachlich endgültige Ablehnungen -> nicht wiederholen (200 an Shopify)
    if (code === "OUT_OF_COVERAGE" || code === "VALIDATION_ERROR" || code === "UNKNOWN_MERCHANT") {
      return await discard(`${code}: ${apiBody.slice(0, 300)}`);
    }
    if (code === "DUPLICATE_REFERENCE_CONFLICT") {
      await logEvent(admin, { ...base, decision: "duplicate", reason: apiBody.slice(0, 300) });
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Technischer Fehler -> 500, Shopify wiederholt mit eigenem Backoff (bis 48h)
    console.error("Übertragung an Routenplanung fehlgeschlagen", apiRes.status, apiBody.slice(0, 500));
    await logEvent(admin, { ...base, decision: "error", error: `API ${apiRes.status}: ${apiBody.slice(0, 400)}` });
    return new Response(JSON.stringify({ error: "Übertragung fehlgeschlagen", status: apiRes.status }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const created = JSON.parse(apiBody);

  // 8. Shop-Zuordnung nachtragen, damit Etikett/Tracking zurück nach Shopify
  //    gemeldet werden kann (shopify-push-fulfillments).
  await admin.from("orders").update({
    shop_connection_id: conn.id,
    external_order_ref: externalId,
    external_order_name: orderName,
  }).eq("id", created.shipment_id);

  await logEvent(admin, { ...base, decision: "imported", reason: created.tracking_number });

  return new Response(JSON.stringify({
    ok: true,
    tracking_number: created.tracking_number,
    tracking_url: created.tracking_url,
    phone_missing: !phone,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
