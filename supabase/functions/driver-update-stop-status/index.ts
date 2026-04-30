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
    const deliveryMode: string | undefined = body.delivery_mode?.trim() || undefined;
    const deliveryNote: string | undefined = body.delivery_note?.trim() || undefined;
    const deliveryRecipient: string | undefined = body.delivery_recipient?.trim() || undefined;
    const signatureBase64: string | undefined = body.signature_base64;

    const ALLOWED_MODES = new Set([
      "persoenlich",
      "briefkasten",
      "nachbar",
      "bemerkung",
    ]);

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
    if (status === "erledigt" && deliveryMode && !ALLOWED_MODES.has(deliveryMode)) {
      return new Response(JSON.stringify({ error: "Ungültiger Übergabe-Modus" }), {
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

    // Use a simpler verification via SQL function instead (must run as the user so auth.uid() is set)
    const { data: ownsStop } = await userClient.rpc("is_stop_route_driver", { _stop_id: stopId });
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
    if (status === "erledigt") {
      stopUpdate.delivery_mode = deliveryMode ?? "persoenlich";
      stopUpdate.delivery_note = deliveryNote ?? null;
      stopUpdate.delivery_recipient = deliveryRecipient ?? null;
      stopUpdate.delivered_at = new Date().toISOString();
    }

    // Upload signature if provided (only meaningful for erledigt)
    let signatureUrl: string | null = null;
    if (status === "erledigt" && signatureBase64 && stop?.order_id) {
      try {
        const cleaned = signatureBase64.replace(/^data:image\/png;base64,/, "");
        const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
        const path = `stops/${stopId}/orders/${stop.order_id}/${Date.now()}.png`;
        const { error: upErr } = await admin.storage
          .from("delivery-signatures")
          .upload(path, bytes, { contentType: "image/png", upsert: true });
        if (!upErr) {
          signatureUrl = path;
          stopUpdate.signature_url = path;
        } else {
          console.error("signature upload failed", upErr);
        }
      } catch (e) {
        console.error("signature decode failed", e);
      }
    }

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
          .select("status, user_id, auftrags_nr, empfaenger_name, empfaenger_email, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, tracking_token")
          .eq("id", stop.order_id)
          .maybeSingle();

        // Idempotency guard: only update + notify when status actually changes.
        const statusChanged = !!order && order.status !== newOrderStatus;

        const orderUpdate: Record<string, unknown> = {
          status: newOrderStatus,
          updated_at: new Date().toISOString(),
        };
        if (newOrderStatus === "zugestellt") orderUpdate.delivered_at = new Date().toISOString();

        if (statusChanged) {
          await admin.from("orders").update(orderUpdate).eq("id", stop.order_id);
        }

        if (statusChanged && newOrderStatus === "nicht_zugestellt" && order) {
          await admin.from("order_status_history").insert({
            order_id: stop.order_id,
            user_id: order.user_id,
            status: newOrderStatus,
            reason: reason ?? null,
            changed_by: userData.user.id,
          });
        }

        // Send status email to recipient
        try {
          if (!statusChanged) {
            // Already in target status — skip duplicate notification.
          } else {
          const email = (order?.empfaenger_email ?? "").trim();
          if (order && email) {
            const { data: p } = await admin
              .from("profiles")
              .select("firma_name, ansprechpartner")
              .eq("user_id", order.user_id)
              .maybeSingle();
            const haendlerName = (p?.firma_name?.trim() || p?.ansprechpartner?.trim() || "Ihr Händler");
            const lieferadresse = [
              order.empfaenger_name,
              order.empfaenger_adresse,
              [order.empfaenger_plz, order.empfaenger_stadt].filter(Boolean).join(" "),
            ].filter((x) => x && String(x).trim().length > 0).join(", ");
            const origin = req.headers.get("origin") || "https://ecargo-logistic.de";
            const trackingUrl = order.tracking_token ? `${origin}/track/${order.tracking_token}` : "";
            const templateData: Record<string, string> = {
              kundenname: order.empfaenger_name,
              haendlerName,
              auftragsNr: order.auftrags_nr,
              lieferadresse,
              trackingUrl,
            };
            if (newOrderStatus === "nicht_zugestellt" && reason) templateData.reason = reason;
            if (newOrderStatus === "zugestellt") {
              const modeMap: Record<string, string> = {
                persoenlich: "Persönlich übergeben",
                briefkasten: "In den Briefkasten gelegt",
                nachbar: "Beim Nachbarn abgegeben",
                bemerkung: "Mit Bemerkung zugestellt",
              };
              const modeKey = (deliveryMode ?? "persoenlich") as string;
              templateData.uebergabeArt = modeMap[modeKey] ?? modeKey;
              if (modeKey === "nachbar" && deliveryRecipient) {
                templateData.nachbarName = deliveryRecipient;
              }
              if (deliveryNote) templateData.uebergabeBemerkung = deliveryNote;
            }
            const templateName = newOrderStatus === "zugestellt" ? "order-zugestellt" : "order-nicht-zugestellt";
            const { error: mailErr } = await userClient.functions.invoke("send-transactional-email", {
              body: {
                templateName,
                recipientEmail: email,
                idempotencyKey: `order-status-${stop.order_id}-${newOrderStatus}`,
                templateData,
              },
            });
            if (mailErr) console.error("status email failed", stop.order_id, mailErr);
          }
          }
        } catch (mailEx) {
          console.error("status email error", mailEx);
        }
      }
    }

    // Check if all stops of this route are done -> close route + return depot
    let routeCompleted = false;
    let endDepot: {
      id: string;
      name: string;
      strasse: string;
      plz: string;
      stadt: string;
      lat: number | null;
      lng: number | null;
    } | null = null;

    if (stop?.route_id) {
      const { count: openCount } = await admin
        .from("route_stops")
        .select("id", { count: "exact", head: true })
        .eq("route_id", stop.route_id)
        .eq("status", "offen");

      if ((openCount ?? 0) === 0) {
        await admin
          .from("routes")
          .update({ status: "abgeschlossen", updated_at: new Date().toISOString() })
          .eq("id", stop.route_id);
        routeCompleted = true;

        const { data: routeRow } = await admin
          .from("routes")
          .select("end_depot_id, start_depot_id")
          .eq("id", stop.route_id)
          .maybeSingle();

        let depotId = routeRow?.end_depot_id ?? routeRow?.start_depot_id ?? null;
        if (!depotId) {
          const { data: def } = await admin
            .from("depots")
            .select("id")
            .eq("is_default", true)
            .maybeSingle();
          depotId = def?.id ?? null;
        }
        if (depotId) {
          const { data: depot } = await admin
            .from("depots")
            .select("id, name, strasse, plz, stadt, lat, lng")
            .eq("id", depotId)
            .maybeSingle();
          if (depot) {
            endDepot = {
              id: depot.id,
              name: depot.name,
              strasse: depot.strasse,
              plz: depot.plz,
              stadt: depot.stadt,
              lat: depot.lat != null ? Number(depot.lat) : null,
              lng: depot.lng != null ? Number(depot.lng) : null,
            };
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, route_completed: routeCompleted, end_depot: endDepot }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});