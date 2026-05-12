import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHOPIFY_API_VERSION = "2024-10";

interface ShopConnection {
  id: string;
  user_id: string;
  platform: string;
  api_key: string;
  api_url: string;
  shop_domain: string | null;
  active: boolean;
  last_external_order_id: string | null;
}

function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  // accept "name" → "name.myshopify.com"
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

async function shopifyFetch(domain: string, token: string, path: string, init: RequestInit = {}) {
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function syncConnection(
  admin: ReturnType<typeof createClient>,
  conn: ShopConnection,
  coveredPostcodes: Set<string>,
) {
  const domain = normalizeDomain(conn.shop_domain ?? conn.api_url);
  if (!domain) {
    return { connectionId: conn.id, error: "Shop-Domain fehlt", imported: 0, skipped: 0 };
  }
  if (!conn.api_key) {
    return { connectionId: conn.id, error: "Access Token fehlt", imported: 0, skipped: 0 };
  }

  const params = new URLSearchParams({
    status: "open",
    financial_status: "paid",
    fulfillment_status: "unshipped",
    limit: "100",
  });
  if (conn.last_external_order_id) params.set("since_id", conn.last_external_order_id);

  const res = await shopifyFetch(domain, conn.api_key, `/orders.json?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    const err = `Shopify API ${res.status}: ${body.slice(0, 300)}`;
    await admin.from("shop_connections").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "error",
      last_sync_error: err,
    }).eq("id", conn.id);
    return { connectionId: conn.id, error: err, imported: 0, skipped: 0 };
  }

  const json = await res.json() as { orders?: Array<Record<string, unknown>> };
  const orders = json.orders ?? [];
  let imported = 0;
  let skippedPlz = 0;
  let skippedDup = 0;
  let maxId = conn.last_external_order_id ? BigInt(conn.last_external_order_id) : 0n;

  for (const o of orders) {
    const externalId = String(o.id);
    const idBig = BigInt(externalId);
    if (idBig > maxId) maxId = idBig;

    const ship = (o.shipping_address ?? null) as Record<string, unknown> | null;
    if (!ship) { skippedPlz++; continue; }
    const country = String(ship.country_code ?? "").toUpperCase();
    if (country && country !== "DE") { skippedPlz++; continue; }
    const plz = String(ship.zip ?? "").trim();
    if (!plz || !coveredPostcodes.has(plz)) { skippedPlz++; continue; }

    // Dedup-Check: existiert schon?
    const { data: existing } = await admin
      .from("orders")
      .select("id")
      .eq("shop_connection_id", conn.id)
      .eq("external_order_ref", externalId)
      .maybeSingle();
    if (existing) { skippedDup++; continue; }

    const name = [ship.first_name, ship.last_name].filter(Boolean).join(" ").trim()
      || String(ship.name ?? "")
      || String((o.customer as Record<string, unknown> | null)?.first_name ?? "")
      || "Empfänger";
    const street = [ship.address1, ship.address2].filter(Boolean).join(" ").trim();
    const city = String(ship.city ?? "").trim();
    const phone = (ship.phone ?? (o.customer as Record<string, unknown> | null)?.phone ?? null) as string | null;
    const email = ((o.customer as Record<string, unknown> | null)?.email ?? o.email ?? null) as string | null;

    // Pakete + Gewicht aus line_items aggregieren
    const lineItems = (o.line_items ?? []) as Array<Record<string, unknown>>;
    let pakete = 0;
    let gewichtG = 0;
    for (const li of lineItems) {
      const qty = Number(li.quantity ?? 0);
      pakete += qty;
      const grams = Number(li.grams ?? 0);
      gewichtG += grams * qty;
    }
    if (pakete === 0) pakete = 1;
    const gewicht = gewichtG > 0 ? Math.max(0.1, +(gewichtG / 1000).toFixed(2)) : 1;

    const orderName = String(o.name ?? `#${externalId}`);
    const noteParts = [`[Shopify ${orderName}]`];
    if (o.note) noteParts.push(String(o.note));
    const notizen = noteParts.join("\n");

    // Absender = Händler-Profil
    const { data: profile } = await admin
      .from("profiles")
      .select("firma_name, ansprechpartner, strasse, plz, stadt")
      .eq("user_id", conn.user_id)
      .maybeSingle();
    const absenderName = (profile?.firma_name || profile?.ansprechpartner || "").trim();
    const absenderAdresse = [
      profile?.strasse,
      [profile?.plz, profile?.stadt].filter(Boolean).join(" "),
    ].filter(Boolean).join(", ");

    const { error: insertErr } = await admin.from("orders").insert({
      user_id: conn.user_id,
      auftrags_nr: "",
      absender_name: absenderName || "Shopify-Import",
      absender_adresse: absenderAdresse,
      empfaenger_name: name,
      empfaenger_adresse: street,
      empfaenger_plz: plz,
      empfaenger_stadt: city,
      empfaenger_email: email,
      empfaenger_telefon: phone,
      pakete,
      gewicht,
      notizen,
      shop_connection_id: conn.id,
      external_order_ref: externalId,
      external_order_name: orderName,
    });
    if (insertErr) {
      console.error("Insert order failed", externalId, insertErr);
      continue;
    }
    imported++;
  }

  await admin.from("shop_connections").update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_error: null,
    last_external_order_id: maxId > 0n ? maxId.toString() : conn.last_external_order_id,
  }).eq("id", conn.id);

  return { connectionId: conn.id, imported, skippedPlz, skippedDup };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    let body: { connectionId?: string } = {};
    try { body = await req.json(); } catch { /* ignore */ }

    let query = admin
      .from("shop_connections")
      .select("id, user_id, platform, api_key, api_url, shop_domain, active, last_external_order_id")
      .eq("platform", "shopify")
      .eq("active", true);
    if (body.connectionId) query = query.eq("id", body.connectionId);

    const { data: connections, error: connErr } = await query;
    if (connErr) throw connErr;

    // PLZ-Coverage einmalig laden
    const { data: pcs } = await admin.from("delivery_zone_postcodes").select("postcode");
    const covered = new Set<string>((pcs ?? []).map((r: { postcode: string }) => r.postcode.trim()));

    const results = [];
    for (const conn of (connections ?? []) as ShopConnection[]) {
      try {
        results.push(await syncConnection(admin, conn, covered));
      } catch (err) {
        console.error("Sync error", conn.id, err);
        results.push({ connectionId: conn.id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("shopify-sync error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});