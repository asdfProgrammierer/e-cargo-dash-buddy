import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED = new Set(["erledigt", "uebersprungen", "offen"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht authentifiziert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Ungültige Sitzung" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const stopId: string = body.stop_id;
    const status: string = body.status;
    const reason: string | undefined = body.reason?.trim() || undefined;

    if (!stopId || !ALLOWED.has(status)) {
      return new Response(JSON.stringify({ error: "Ungültige Eingabe" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (status === "uebersprungen" && !reason) {
      return new Response(JSON.stringify({ error: "Grund ist erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify driver owns this stop's route
    const { data: stop, error: stopErr } = await admin
      .from("route_stops")
      .select("id, order_id, route_id, routes!inner(driver_id, drivers!inner(auth_user_id))")
      .eq("id", stopId)
      .maybeSingle();

    // Use a simpler verification via SQL function instead
    const { data: ownsStop } = await admin.rpc("is_stop_route_driver", { _stop_id: stopId });
    if (!ownsStop) {
      return new Response(JSON.stringify({ error: "Kein Zugriff auf diesen Stopp" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (stopErr || !stop) {
      return new Response(JSON.stringify({ error: "Stopp nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stopUpdate: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (reason) stopUpdate.notiz = reason;

    const { error: rsErr } = await admin.from("route_stops").update(stopUpdate).eq("id", stopId);
    if (rsErr) {
      return new Response(JSON.stringify({ error: rsErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map stop status -> order status
    if (stop.order_id) {
      let newOrderStatus: string | null = null;
      if (status === "erledigt") newOrderStatus = "zugestellt";
      else if (status === "uebersprungen") newOrderStatus = "nicht_zugestellt";

      if (newOrderStatus) {
        const { data: order } = await admin
          .from("orders")
          .select("user_id")
          .eq("id", stop.order_id)
          .maybeSingle();

        const orderUpdate: Record<string, unknown> = {
          status: newOrderStatus,
          updated_at: new Date().toISOString(),
        };
        if (newOrderStatus === "zugestellt") orderUpdate.delivered_at = new Date().toISOString();

        await admin.from("orders").update(orderUpdate).eq("id", stop.order_id);

        if (newOrderStatus === "nicht_zugestellt" && order) {
          await admin.from("order_status_history").insert({
            order_id: stop.order_id,
            user_id: order.user_id,
            status: newOrderStatus,
            reason: reason ?? null,
            changed_by: userData.user.id,
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});