import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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