import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildTrackingUrl } from "../_shared/site-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHOPIFY_API_VERSION = "2024-10";
const LABEL_NOTE_MARKER = "[e-cargo-label]";

function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  // SSRF guard: only allow Shopify-hosted shop domains.
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) return null;
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

  const isDhl = !!order.dhl_tracking_number;

  // Tracking-Info: bevorzugt DHL, sonst e-cargo Tracking
  const trackingNumber = order.dhl_tracking_number?.trim() || order.auftrags_nr;
  const ecargoTrackingUrl = buildTrackingUrl(order.tracking_token, req);
  const dhlTrackingUrl = order.dhl_tracking_number
    ? `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(order.dhl_tracking_number)}`
    : null;
  const trackingUrl = dhlTrackingUrl || ecargoTrackingUrl;
  const trackingCompany = isDhl ? "DHL" : "e-cargo";

  // Label-Link für die Order-Note: bevorzugt direkt das DHL-Label-PDF (signed URL),
  // sonst die e-cargo Tracking-Seite, von der aus der Händler das Label drucken kann.
  let labelLink: string | null = order.dhl_label_url ?? null;
  if (isDhl && order.dhl_label_url) {
    // Wenn dhl_label_url ein Storage-Pfad statt einer signed URL ist, signieren.
    if (!/^https?:\/\//i.test(order.dhl_label_url)) {
      const { data: signed } = await admin.storage
        .from("delivery-notes")
        .createSignedUrl(order.dhl_label_url, 60 * 60 * 24 * 7);
      labelLink = signed?.signedUrl ?? labelLink;
    }
  }
  if (!labelLink) labelLink = ecargoTrackingUrl;

  // 0. Order-Note in Shopify ergänzen (idempotent über Marker)
  if (labelLink) {
    try {
      const noteRes = await shopifyFetch(
        domain, conn.api_key,
        `/orders/${order.external_order_ref}.json?fields=note`,
      );
      if (noteRes.ok) {
        const noteJson = await noteRes.json() as { order?: { note?: string | null } };
        const existing = (noteJson.order?.note ?? "").trim();
        if (!existing.includes(LABEL_NOTE_MARKER)) {
          const block = `${LABEL_NOTE_MARKER}\nVersand durch e-cargo (${trackingCompany})\nEtikett: ${labelLink}${trackingUrl ? `\nTracking: ${trackingUrl}` : ""}`;
          const newNote = existing ? `${existing}\n\n${block}` : block;
          await shopifyFetch(domain, conn.api_key, `/orders/${order.external_order_ref}.json`, {
            method: "PUT",
            body: JSON.stringify({ order: { id: Number(order.external_order_ref), note: newNote } }),
          });
        }
      }
    } catch (e) {
      console.warn("note update failed", order.id, e);
    }
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

  const fulRes = await shopifyFetch(domain, conn.api_key, `/fulfillments.json`, {
    method: "POST",
    body: JSON.stringify({
      fulfillment: {
        message: "Versand durch e-cargo",
        // Bei DHL keine Shopify-Kundenmail (konsistent mit unterdrückter e-cargo Mail).
        notify_customer: !isDhl,
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

// e-cargo-Status → Shopify Fulfillment-Event (Spalte „Delivery status").
// "neu" erscheint in Shopify bereits als „Tracking added", sobald ein Fulfillment existiert.
export const SHOPIFY_EVENT_FOR_STATUS: Record<string, string> = {
  in_bearbeitung: "in_transit",
  unterwegs: "out_for_delivery",
  zugestellt: "delivered",
  nicht_zugestellt: "attempted_delivery",
};

async function syncDeliveryEvents(admin: ReturnType<typeof createClient>, req: Request, orderId?: string) {
  const { data: conns } = await admin
    .from("shop_connections")
    .select("id, api_key, api_url, shop_domain, active, platform, sync_delivery_status")
    .eq("platform", "shopify").eq("active", true).eq("sync_delivery_status", true);
  if (!conns || conns.length === 0) return [];
  const connMap = new Map(conns.map((c) => [c.id, c]));

  let q = admin
    .from("orders")
    .select("id, status, auftrags_nr, tracking_token, external_order_ref, shop_connection_id, shopify_fulfillment_id, shopify_event_status")
    .in("shop_connection_id", conns.map((c) => c.id))
    .not("external_order_ref", "is", null)
    .in("status", ["neu", ...Object.keys(SHOPIFY_EVENT_FOR_STATUS)])
    .gte("updated_at", new Date(Date.now() - 14 * 86400_000).toISOString())
    .limit(100);
  if (orderId) q = q.eq("id", orderId);
  const { data: orders, error } = await q;
  if (error) { console.error("event sync query", error); return []; }

  const results: Array<Record<string, unknown>> = [];
  for (const o of orders ?? []) {
    const event = SHOPIFY_EVENT_FOR_STATUS[o.status as string];
    const needsTracking = !o.shopify_fulfillment_id;
    if (!needsTracking && (!event || o.shopify_event_status === event)) continue;
    const conn = connMap.get(o.shop_connection_id as string)!;
    const domain = normalizeDomain(conn.shop_domain ?? conn.api_url);
    if (!domain || !conn.api_key) continue;
    try {
      let fulfillmentId = o.shopify_fulfillment_id as string | null;
      if (!fulfillmentId) {
        const fr = await shopifyFetch(domain, conn.api_key, `/orders/${o.external_order_ref}/fulfillments.json`);
        if (!fr.ok) throw new Error(`fulfillments ${fr.status}`);
        const fj = await fr.json() as { fulfillments?: Array<{ id: number; status: string }> };
        const active = (fj.fulfillments ?? []).filter((f) => f.status !== "cancelled" && f.status !== "error");
        const last = active[active.length - 1];
        if (!last) { results.push({ orderId: o.id, skipped: "kein Fulfillment in Shopify" }); continue; }
        fulfillmentId = String(last.id);
        // e-cargo-Sendungsverfolgung am bestehenden Shopify-Fulfillment hinterlegen
        const url = buildTrackingUrl(o.tracking_token as string | null, req);
        const tr = await shopifyFetch(domain, conn.api_key, `/fulfillments/${fulfillmentId}/update_tracking.json`, {
          method: "POST",
          body: JSON.stringify({ fulfillment: { notify_customer: false, tracking_info: {
            number: o.auftrags_nr, url: url || undefined, company: "e-cargo",
          } } }),
        });
        if (!tr.ok) throw new Error(`tracking ${tr.status}: ${(await tr.text()).slice(0, 200)}`);
        await admin.from("orders").update({ shopify_fulfillment_id: fulfillmentId }).eq("id", o.id);
        if (!event || o.shopify_event_status === event) { results.push({ orderId: o.id, tracking: true }); continue; }
      }
      const er = await shopifyFetch(
        domain, conn.api_key,
        `/orders/${o.external_order_ref}/fulfillments/${fulfillmentId}/events.json`,
        { method: "POST", body: JSON.stringify({ event: { status: event } }) },
      );
      if (!er.ok) throw new Error(`event ${er.status}: ${(await er.text()).slice(0, 200)}`);
      await admin.from("orders").update({
        shopify_event_status: event, shopify_event_error: null, shopify_fulfillment_id: fulfillmentId,
      }).eq("id", o.id);
      results.push({ orderId: o.id, event });
    } catch (err) {
      console.error("event sync", o.id, err);
      await admin.from("orders").update({ shopify_event_error: String(err).slice(0, 300) }).eq("id", o.id);
      results.push({ orderId: o.id, error: String(err) });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Auth guard: only admins or service_role (cron) may invoke.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  let isAuthorized = false;
  if (token && token === serviceKey) {
    isAuthorized = true;
  } else if (token) {
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (roleRow) isAuthorized = true;
    }
  }
  if (!isAuthorized) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let body: { orderId?: string } = {};
    try { body = await req.json(); } catch { /* ignore */ }

    // Trigger: Shopify-Orders mit fertigem Etikett (DHL ODER e-cargo Druck) bzw. ab
    // Status 'in_bearbeitung' / 'unterwegs' / 'zugestellt'.
    let q = admin
      .from("orders")
      .select("id, external_order_ref, shop_connection_id, status, tracking_token, dhl_tracking_number, dhl_label_url, auftrags_nr")
      .not("shop_connection_id", "is", null)
      .not("external_order_ref", "is", null)
      .is("shopify_fulfilled_at", null);
    if (body.orderId) {
      q = q.eq("id", body.orderId);
    } else {
      // Cron-Run: nur Orders mit Label oder fortgeschrittenem Status.
      q = q.or("dhl_label_url.not.is.null,status.in.(in_bearbeitung,unterwegs,zugestellt)");
    }

    const { data: orders, error: oErr } = await q;
    if (oErr) throw oErr;

    const eventResults = await syncDeliveryEvents(admin, req, body.orderId);

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ ok: true, results: [], eventResults }), {
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

    return new Response(JSON.stringify({ ok: true, results, eventResults }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("shopify-push-fulfillments error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});