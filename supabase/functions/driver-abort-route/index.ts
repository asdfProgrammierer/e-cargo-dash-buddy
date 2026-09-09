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
    const reason: string | undefined =
      typeof body.reason === "string" ? body.reason.slice(0, 300) : undefined;
    if (!routeId) return json({ error: "route_id fehlt" }, 400);

    const { data: owns } = await userClient.rpc("is_route_driver", { _route_id: routeId });
    if (!owns) return json({ error: "Kein Zugriff auf diese Route" }, 403);

    const { data: route } = await admin
      .from("routes")
      .select("id, status, notizen")
      .eq("id", routeId)
      .maybeSingle();
    if (!route) return json({ error: "Route nicht gefunden" }, 404);
    if (route.status === "abgeschlossen") {
      return json({ error: "Route ist bereits abgeschlossen" }, 409);
    }

    // Offene Stops der Route ermitteln
    const { data: openStops } = await admin
      .from("route_stops")
      .select("id, order_id")
      .eq("route_id", routeId)
      .eq("status", "offen");

    const stopIds = (openStops ?? []).map((s: { id: string }) => s.id);
    const orderIds = (openStops ?? [])
      .map((s: { order_id: string | null }) => s.order_id)
      .filter((id): id is string => !!id);

    // Betroffene Aufträge, die noch unterwegs sind
    let affected: { id: string; empfaenger_email: string | null }[] = [];
    if (orderIds.length > 0) {
      const { data: orders } = await admin
        .from("orders")
        .select("id, empfaenger_email, status")
        .in("id", orderIds)
        .eq("status", "unterwegs");
      affected = (orders ?? []) as typeof affected;
    }

    // E-Mails an Endkunden
    let mailsSent = 0;
    for (const o of affected) {
      if (!o.empfaenger_email) continue;
      try {
        const { error: mailErr } = await userClient.functions.invoke("send-app-email", {
          body: {
            templateName: "order-tour-abgebrochen",
            recipientEmail: o.empfaenger_email,
            orderId: o.id,
            idempotencyKey: `order-tour-abgebrochen-${o.id}-${routeId}`,
            templateData: {},
          },
        });
        if (mailErr) console.error("abort mail failed", o.id, mailErr);
        else mailsSent++;
      } catch (e) {
        console.error("abort mail error", o.id, e);
      }
    }

    const now = new Date().toISOString();

    // Aufträge zurück in die Planung
    if (affected.length > 0) {
      const { error: oErr } = await admin
        .from("orders")
        .update({ status: "in_bearbeitung", updated_at: now })
        .in("id", affected.map((o) => o.id));
      if (oErr) console.error("order reset failed", oErr);
    }

    // Offene Stops von der Route entfernen
    if (stopIds.length > 0) {
      const { error: sErr } = await admin.from("route_stops").delete().in("id", stopIds);
      if (sErr) console.error("stop delete failed", sErr);
    }

    // Route abschließen + Grund notieren
    const note = [route.notizen, `Route vom Fahrer vorzeitig beendet (${new Date(now).toLocaleString("de-DE")})${reason ? `: ${reason}` : ""}`]
      .filter(Boolean)
      .join("\n");
    await admin
      .from("routes")
      .update({ status: "abgeschlossen", notizen: note, updated_at: now })
      .eq("id", routeId);

    // Arbeitszeit-Session beenden
    try {
      await userClient.rpc("driver_end_work_session", { _reason: "route_abgebrochen" });
    } catch (e) {
      console.error("end work session failed", e);
    }

    return json({ ok: true, affected_orders: affected.length, mails_sent: mailsSent });
  } catch (e) {
    console.error("driver-abort-route error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
