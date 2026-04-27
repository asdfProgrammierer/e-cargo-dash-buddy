import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OptimizeRequest {
  routeId: string;
  profile?: "driving-car" | "cycling-regular" | "cycling-electric";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

    // Admin check
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return json({ error: "Forbidden" }, 403);

    const apiKey = Deno.env.get("ORS_API_KEY");
    if (!apiKey) return json({ error: "ORS_API_KEY not configured" }, 500);

    const body = (await req.json()) as OptimizeRequest;
    if (!body?.routeId) return json({ error: "routeId required" }, 400);
    const profile = body.profile ?? "cycling-electric";

    // Use service role for cross-table reads to bypass any tracking_token-style limits
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load route + depots
    const { data: route, error: routeErr } = await admin
      .from("routes")
      .select("*")
      .eq("id", body.routeId)
      .single();
    if (routeErr || !route) return json({ error: "Route nicht gefunden" }, 404);

    // Load global stop duration (Pufferzeit pro Stopp)
    const { data: settings } = await admin
      .from("route_settings")
      .select("stop_duration_minutes")
      .eq("id", 1)
      .maybeSingle();
    const stopDurationSec = ((settings?.stop_duration_minutes as number | undefined) ?? 4) * 60;

    // Resolve start/end depot (fallback: default depot)
    let startDepotId = route.start_depot_id as string | null;
    let endDepotId = route.end_depot_id as string | null;
    if (!startDepotId || !endDepotId) {
      const { data: def } = await admin
        .from("depots")
        .select("id")
        .eq("is_default", true)
        .eq("active", true)
        .maybeSingle();
      if (!def) return json({ error: "Kein Standard-Depot definiert" }, 400);
      startDepotId = startDepotId ?? def.id;
      endDepotId = endDepotId ?? def.id;
    }

    const { data: depots } = await admin
      .from("depots")
      .select("id, name, lat, lng")
      .in("id", [startDepotId, endDepotId]);
    const startDepot = depots?.find((d) => d.id === startDepotId);
    const endDepot = depots?.find((d) => d.id === endDepotId);
    if (!startDepot?.lat || !startDepot?.lng || !endDepot?.lat || !endDepot?.lng) {
      return json({ error: "Depot ist nicht geocodiert" }, 400);
    }

    // Load stops + their orders
    const { data: stops } = await admin
      .from("route_stops")
      .select("id, order_id, orders(id, lat, lng, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt)")
      .eq("route_id", body.routeId);
    if (!stops || stops.length === 0) return json({ error: "Keine Stops vorhanden" }, 400);

    type StopRow = { id: string; order_id: string; orders: { id: string; lat: number | null; lng: number | null } };
    const valid = (stops as unknown as StopRow[]).filter((s) => s.orders?.lat != null && s.orders?.lng != null);
    if (valid.length === 0) return json({ error: "Keine Stops mit Koordinaten" }, 400);

    // Build ORS optimization payload
    const jobs = valid.map((s, idx) => ({
      id: idx + 1,
      location: [Number(s.orders.lng), Number(s.orders.lat)],
      // attach our id as description for round-trip
      description: s.id,
    }));
    const vehicles = [{
      id: 1,
      profile,
      start: [Number(startDepot.lng), Number(startDepot.lat)],
      end: [Number(endDepot.lng), Number(endDepot.lat)],
    }];

    const optRes = await fetch("https://api.openrouteservice.org/optimization", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ jobs, vehicles }),
    });
    if (!optRes.ok) {
      const t = await optRes.text();
      return json({ error: "Optimierung fehlgeschlagen", details: t }, 502);
    }
    const optData = await optRes.json();
    const route0 = optData?.routes?.[0];
    if (!route0) return json({ error: "Keine Route von ORS" }, 502);

    // Order steps that are jobs
    const jobSteps = (route0.steps as Array<{ type: string; job?: number; description?: string }>)
      .filter((s) => s.type === "job");

    // Build directions request to get geometry for the actual ordered path
    const coords: [number, number][] = [
      [Number(startDepot.lng), Number(startDepot.lat)],
      ...jobSteps.map((s) => {
        const job = jobs.find((j) => j.id === s.job);
        return job!.location as [number, number];
      }),
      [Number(endDepot.lng), Number(endDepot.lat)],
    ];

    const dirRes = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/geo+json",
      },
      body: JSON.stringify({ coordinates: coords, instructions: false }),
    });
    if (!dirRes.ok) {
      const t = await dirRes.text();
      return json({ error: "Routing fehlgeschlagen", details: t }, 502);
    }
    const dirData = await dirRes.json();
    const feat = dirData?.features?.[0];
    const geometry = feat?.geometry ?? null;
    const segments = feat?.properties?.segments as Array<{ distance: number; duration: number }> | undefined;

    // Update positions + leg metrics
    // segments[i] = leg from coords[i] to coords[i+1]; leg for stop i corresponds to segments[i] (depot->stop1, stop1->stop2,..)
    let position = 1;
    // Build cursor for ETA: Routendatum + Startzeit (lokal interpretiert)
    const startTime = (route.start_time as string | null)?.slice(0, 5) ?? "09:00";
    const baseIso = `${route.datum as string}T${startTime}:00`;
    let cursorMs = new Date(baseIso).getTime();
    if (isNaN(cursorMs)) cursorMs = Date.now();
    for (const step of jobSteps) {
      const job = jobs.find((j) => j.id === step.job)!;
      const stopId = job.description!;
      const seg = segments?.[position - 1];
      if (seg) cursorMs += seg.duration * 1000;
      const etaIso = new Date(cursorMs).toISOString();
      await admin.from("route_stops").update({
        position,
        leg_distance_m: seg ? Math.round(seg.distance) : null,
        leg_duration_s: seg ? Math.round(seg.duration) : null,
        eta: etaIso,
      }).eq("id", stopId);
      // Service-Zeit am Stopp einrechnen
      cursorMs += stopDurationSec * 1000;
      position += 1;
    }

    const totalDist = segments?.reduce((a, s) => a + s.distance, 0) ?? route0.distance ?? 0;
    const drivingDur = segments?.reduce((a, s) => a + s.duration, 0) ?? route0.duration ?? 0;
    // Gesamtdauer = Fahrzeit + Service-Zeit aller Stopps
    const totalDur = drivingDur + jobSteps.length * stopDurationSec;

    await admin.from("routes").update({
      start_depot_id: startDepotId,
      end_depot_id: endDepotId,
      total_distance_m: Math.round(totalDist),
      total_duration_s: Math.round(totalDur),
      geometry,
      optimized_at: new Date().toISOString(),
    }).eq("id", body.routeId);

    return json({
      ok: true,
      total_distance_m: Math.round(totalDist),
      total_duration_s: Math.round(totalDur),
      stops_optimized: jobSteps.length,
    }, 200);
  } catch (err) {
    console.error("optimize-route error", err);
    return json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}