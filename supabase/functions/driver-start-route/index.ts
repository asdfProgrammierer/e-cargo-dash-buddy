import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildEtaWindow, ETA_FALLBACK_TEXT } from "../_shared/eta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Nicht authentifiziert" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Ungültige Sitzung" }, 401);

    const body = await req.json().catch(() => ({}));
    const routeId: string | undefined = body.route_id;
    if (!routeId) return json({ error: "route_id fehlt" }, 400);

    const { data: owns } = await userClient.rpc("is_route_driver", { _route_id: routeId });
    if (!owns) return json({ error: "Kein Zugriff auf diese Route" }, 403);

    const { data: route, error: routeErr } = await admin
      .from("routes")
      .select("id, status")
      .eq("id", routeId)
      .maybeSingle();
    if (routeErr || !route) return json({ error: "Route nicht gefunden" }, 404);
    if (route.status === "abgeschlossen") return json({ error: "Route bereits abgeschlossen" }, 409);
    if (route.status === "aktiv") return json({ ok: true, already_active: true });
    if (route.status !== "geplant") return json({ error: "Route kann nicht gestartet werden" }, 409);

    const now = new Date().toISOString();

    const { error: rUpdErr } = await admin
      .from("routes")
      .update({ status: "aktiv", updated_at: now })
      .eq("id", routeId);
    if (rUpdErr) return json({ error: rUpdErr.message }, 400);

    // Collect order ids from this route's stops
    const { data: stops } = await admin
      .from("route_stops")
      .select("order_id")
      .eq("route_id", routeId);

    const orderIds = (stops ?? [])
      .map((s: { order_id: string | null }) => s.order_id)
      .filter((id): id is string => !!id);

    let updatedOrders = 0;
    if (orderIds.length > 0) {
      const { data: upd, error: oUpdErr } = await admin
        .from("orders")
        .update({ status: "unterwegs", updated_at: now })
        .in("id", orderIds)
        .in("status", ["neu", "in_bearbeitung"])
        .select("id");
      if (oUpdErr) console.error("order update failed", oUpdErr);
      updatedOrders = upd?.length ?? 0;

      // Send "unterwegs" email to recipients with ETA window (±30 min)
      try {
        const updatedIds = (upd ?? []).map((r: { id: string }) => r.id);
        if (updatedIds.length > 0) {
          const { data: orderRows } = await admin
            .from("orders")
            .select("id, user_id, auftrags_nr, empfaenger_name, empfaenger_email, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, tracking_token")
            .in("id", updatedIds);

          const { data: stopRows } = await admin
            .from("route_stops")
            .select("order_id, eta")
            .eq("route_id", routeId)
            .in("order_id", updatedIds);
          const etaByOrder = new Map<string, string | null>();
          (stopRows ?? []).forEach((s: { order_id: string | null; eta: string | null }) => {
            if (s.order_id) etaByOrder.set(s.order_id, s.eta);
          });

          const merchantNameCache = new Map<string, string>();
          const getMerchantName = async (uid: string) => {
            if (merchantNameCache.has(uid)) return merchantNameCache.get(uid)!;
            const { data: p } = await admin
              .from("profiles")
              .select("firma_name, ansprechpartner")
              .eq("user_id", uid)
              .maybeSingle();
            const name = (p?.firma_name?.trim() || p?.ansprechpartner?.trim() || "Ihr Händler");
            merchantNameCache.set(uid, name);
            return name;
          };

          const origin = req.headers.get("origin") || "https://ecargo-logistic.de";

          for (const o of orderRows ?? []) {
            const email = (o.empfaenger_email ?? "").trim();
            if (!email) continue;
            const etaIso = etaByOrder.get(o.id);
            const eta = buildEtaWindow(etaIso ?? null);
            const etaWindow = eta?.window ?? ETA_FALLBACK_TEXT;
            const etaCenter = eta?.center;
            const haendlerName = await getMerchantName(o.user_id);
            const lieferadresse = [
              o.empfaenger_name,
              o.empfaenger_adresse,
              [o.empfaenger_plz, o.empfaenger_stadt].filter(Boolean).join(" "),
            ].filter((x) => x && String(x).trim().length > 0).join(", ");
            const trackingUrl = o.tracking_token ? `${origin}/track/${o.tracking_token}` : "";

            const templateData: Record<string, string> = {
              kundenname: o.empfaenger_name,
              haendlerName,
              auftragsNr: o.auftrags_nr,
              lieferadresse,
              trackingUrl,
            };
            templateData.etaWindow = etaWindow;
            if (etaCenter) templateData.etaCenter = etaCenter;

            const { error: mailErr } = await admin.functions.invoke("send-transactional-email", {
              body: {
                templateName: "order-unterwegs",
                recipientEmail: email,
                idempotencyKey: `order-status-${o.id}-unterwegs`,
                templateData,
              },
            });
            if (mailErr) console.error("unterwegs email failed", o.id, mailErr);
          }
        }
      } catch (mailEx) {
        console.error("unterwegs email batch failed", mailEx);
      }
    }

    return json({ ok: true, updated_orders: updatedOrders });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});