import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildTrackingUrl } from "../_shared/site-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHOPIFY_API_VERSION = "2024-10";

function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

async function shopifyFetch(domain: string, token: string, path: string, init: RequestInit = {}) {
  return fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function pushFulfillment(
  admin: ReturnType<typeof createClient>,
  order: {
    id: string; external_order_ref: string; tracking_token: string | null;
    dhl_tracking_number: string | null; dhl_label_url: string | null;
    auftrags_nr: string;
  },
  conn: { id: string; api_key: string; api_url: string; shop_domain: string | null; user_id: string },
  req: Request,
) {
  const domain = normalizeDomain(conn.shop_domain ?? conn.api_url);
  if (!domain || !conn.api_key) {
    return { orderId: order.id, error: "Verbindung unvollständig" };
  }

  // 1. Fulfillment Orders abrufen
  const foRes = await shopifyFetch(
    domain, conn.api_key,
    `/orders/${order.external_order_ref}/fulfillment_orders.json`,
  );
  if (!foRes.ok) {
    const body = await foRes.text();
    return { orderId: order.id, error: `fulfillment_orders ${foRes.status}: ${body.slice(0, 200)}` };
  }
  const foJson = await foRes.json() as {
    fulfillment_orders?: Array<{ id: number; status: string; line_items: Array<{ id: number; quantity: number }> }>;
  };
  const openFOs = (foJson.fulfillment_orders ?? []).filter((fo) => fo.status === "open");
  if (openFOs.length === 0) {
    // Nichts mehr zu fulfillen → als erledigt markieren, damit wir es nicht mehr versuchen
    await admin.from("orders").update({
      shopify_fulfilled_at: new Date().toISOString(),
    }).eq("id", order.id);
    return { orderId: order.id, skipped: "no open fulfillment orders" };
  }

  // Tracking-Info: bevorzugt DHL, sonst e-cargo Tracking
  const trackingNumber = order.dhl_tracking_number?.trim()
    || order.auftrags_nr;
  const trackingUrl = order.dhl_label_url?.trim()
    ? `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(order.dhl_tracking_number ?? "")}`
    : buildTrackingUrl(order.tracking_token, req);
  const trackingCompany = order.dhl_tracking_number ? "DHL" : "e-cargo";

  const fulRes = await shopifyFetch(domain, conn.api_key, `/fulfillments.json`, {
    method: "POST",
    body: JSON.stringify({
      fulfillment: {
        message: "Versand durch e-cargo",
        notify_customer: true,
        tracking_info: {
          number: trackingNumber,
          url: trackingUrl || undefined,
          company: trackingCompany,
        },
        line_items_by_fulfillment_order: openFOs.map((fo) => ({
          fulfillment_order_id: fo.id,
          fulfillment_order_line_items: fo.line_items.map((li) => ({ id: li.id, quantity: li.quantity })),
        })),
      },
    }),
  });
  if (!fulRes.ok) {
    const body = await fulRes.text();
    return { orderId: order.id, error: `fulfillment ${fulRes.status}: ${body.slice(0, 300)}` };
  }
  const fulJson = await fulRes.json() as { fulfillment?: { id: number } };
  await admin.from("orders").update({
    shopify_fulfillment_id: fulJson.fulfillment?.id ? String(fulJson.fulfillment.id) : null,
    shopify_fulfilled_at: new Date().toISOString(),
  }).eq("id", order.id);

  return { orderId: order.id, ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    let body: { orderId?: string } = {};
    try { body = await req.json(); } catch { /* ignore */ }

    // Trigger: orders, die zu Shopify gehören, schon mind. unterwegs sind und noch
    // nicht zurückgemeldet wurden.
    let q = admin
      .from("orders")
      .select("id, external_order_ref, shop_connection_id, status, tracking_token, dhl_tracking_number, dhl_label_url, auftrags_nr")
      .not("shop_connection_id", "is", null)
      .not("external_order_ref", "is", null)
      .is("shopify_fulfilled_at", null)
      .in("status", ["unterwegs", "zugestellt"]);
    if (body.orderId) q = q.eq("id", body.orderId);

    const { data: orders, error: oErr } = await q;
    if (oErr) throw oErr;

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ ok: true, results: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const connIds = Array.from(new Set(orders.map((o) => o.shop_connection_id).filter(Boolean))) as string[];
    const { data: conns } = await admin
      .from("shop_connections")
      .select("id, api_key, api_url, shop_domain, user_id, auto_fulfill, active, platform")
      .in("id", connIds);
    const connMap = new Map((conns ?? []).map((c) => [c.id, c]));

    const results = [];
    for (const o of orders) {
      const conn = connMap.get(o.shop_connection_id as string);
      if (!conn || conn.platform !== "shopify" || !conn.active || !conn.auto_fulfill) continue;
      try {
        results.push(await pushFulfillment(admin, o as never, conn as never, req));
      } catch (err) {
        console.error("push error", o.id, err);
        results.push({ orderId: o.id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("shopify-push-fulfillments error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});