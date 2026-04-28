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
      .select("id, order_id, position, pinned, orders(id, lat, lng, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt)")
      .eq("route_id", body.routeId)
      .order("position", { ascending: true });
    if (!stops || stops.length === 0) return json({ error: "Keine Stops vorhanden" }, 400);

    type StopRow = { id: string; order_id: string; position: number; pinned: boolean; orders: { id: string; lat: number | null; lng: number | null } };
    const valid = (stops as unknown as StopRow[]).filter((s) => s.orders?.lat != null && s.orders?.lng != null);
    if (valid.length === 0) return json({ error: "Keine Stops mit Koordinaten" }, 400);

    // ----- Segmentweise Optimierung mit fixierten Stopps -----
    // Splitte die Stopps in Segmente, die jeweils zwischen zwei "Ankern" liegen.
    // Anker sind: Start-Depot, fixierte Stopps (in ihrer aktuellen Reihenfolge), End-Depot.
    type Anchor =
      | { kind: "depot"; lng: number; lat: number }
      | { kind: "stop"; stop: StopRow };

    const pinned = valid.filter((s) => s.pinned);
    const free = valid.filter((s) => !s.pinned);

    const anchors: Anchor[] = [
      { kind: "depot", lng: Number(startDepot.lng), lat: Number(startDepot.lat) },
      ...pinned.map((s) => ({ kind: "stop" as const, stop: s })),
      { kind: "depot", lng: Number(endDepot.lng), lat: Number(endDepot.lat) },
    ];

    // Verteile die freien Stopps gleichmäßig auf die Segmente (zunächst alle ins erste).
    // Bessere Heuristik: ordne jeden freien Stop dem nächstgelegenen Segment-Mittelpunkt zu.
    const anchorLngLat = (a: Anchor): [number, number] =>
      a.kind === "depot" ? [a.lng, a.lat] : [Number(a.stop.orders.lng), Number(a.stop.orders.lat)];

    const segmentBuckets: StopRow[][] = Array.from({ length: anchors.length - 1 }, () => []);
    if (segmentBuckets.length === 1) {
      segmentBuckets[0] = free;
    } else {
      for (const f of free) {
        const fLng = Number(f.orders.lng);
        const fLat = Number(f.orders.lat);
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < segmentBuckets.length; i++) {
          const [aLng, aLat] = anchorLngLat(anchors[i]);
          const [bLng, bLat] = anchorLngLat(anchors[i + 1]);
          // Distance from f to segment midpoint (rough heuristic, equirect)
          const mLng = (aLng + bLng) / 2;
          const mLat = (aLat + bLat) / 2;
          const dx = (fLng - mLng) * Math.cos((mLat * Math.PI) / 180);
          const dy = fLat - mLat;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        segmentBuckets[bestIdx].push(f);
      }
    }

    // Pro Segment: wenn freie Stopps vorhanden, ORS Optimization aufrufen
    // (Start = Anker[i], End = Anker[i+1], Jobs = bucket[i]).
    // Sammelt finale geordnete Stopp-IDs.
    const orderedStopIds: string[] = [];

    for (let i = 0; i < segmentBuckets.length; i++) {
      const bucket = segmentBuckets[i];
      if (bucket.length === 0) {
        // Nur Anker-zu-Anker, kein Job dazwischen.
        if (anchors[i + 1].kind === "stop") {
          orderedStopIds.push((anchors[i + 1] as { kind: "stop"; stop: StopRow }).stop.id);
        }
        continue;
      }
      const [sLng, sLat] = anchorLngLat(anchors[i]);
      const [eLng, eLat] = anchorLngLat(anchors[i + 1]);
      const segJobs = bucket.map((s, idx) => ({
        id: idx + 1,
        location: [Number(s.orders.lng), Number(s.orders.lat)] as [number, number],
        description: s.id,
      }));
      const segVehicles = [{
        id: 1,
        profile,
        start: [sLng, sLat] as [number, number],
        end: [eLng, eLat] as [number, number],
      }];
      const segRes = await fetch("https://api.openrouteservice.org/optimization", {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ jobs: segJobs, vehicles: segVehicles }),
      });
      if (!segRes.ok) {
        const t = await segRes.text();
        return json({ error: "Optimierung fehlgeschlagen", details: t }, 502);
      }
      const segData = await segRes.json();
      const segRoute = segData?.routes?.[0];
      if (!segRoute) return json({ error: "Keine Route von ORS (Segment)" }, 502);
      type OrsStep = { type: string; job?: number; description?: string };
      const segSteps = ((segRoute.steps as OrsStep[]) ?? []).filter((st) => st.type === "job");
      for (const st of segSteps) {
        const job = segJobs.find((j) => j.id === st.job);
        if (job) orderedStopIds.push(job.description!);
      }
      // Nach diesem Segment kommt der Anker (falls Stop)
      if (anchors[i + 1].kind === "stop") {
        orderedStopIds.push((anchors[i + 1] as { kind: "stop"; stop: StopRow }).stop.id);
      }
    }

    // Sicherheits-Check: alle Stopps drin
    if (orderedStopIds.length !== valid.length) {
      return json({ error: "Optimierung unvollständig (Anzahl Stopps)" }, 500);
    }

    // Validierung: gepinnte Stopps müssen ihre RELATIVE Reihenfolge behalten.
    // (Die absolute Position ändert sich segmentweise, je nachdem wie viele
    // freie Stopps in den Segmenten davor einsortiert wurden – das ist gewollt.)
    const pinnedOriginalOrder = pinned
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => s.id);
    const pinnedNewOrder = orderedStopIds.filter((id) => pinnedOriginalOrder.includes(id));
    const orderOk = pinnedOriginalOrder.length === pinnedNewOrder.length &&
      pinnedOriginalOrder.every((id, i) => pinnedNewOrder[i] === id);
    if (!orderOk) {
      console.error("Pinned stops reordered during optimization", {
        before: pinnedOriginalOrder,
        after: pinnedNewOrder,
      });
      return json({
        error: "Optimierung würde die Reihenfolge fixierter Stopps verändern",
      }, 500);
    }

    // Map id → StopRow
    const stopById = new Map(valid.map((s) => [s.id, s] as const));
    const orderedStops = orderedStopIds.map((id) => stopById.get(id)!);

    // Build directions request to get geometry for the actual ordered path
    const coords: [number, number][] = [
      [Number(startDepot.lng), Number(startDepot.lat)],
      ...orderedStops.map((s) => [Number(s.orders.lng), Number(s.orders.lat)] as [number, number]),
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

    // Per-leg durations/distances aus Directions ableiten.
    const legCount = orderedStops.length + 1; // depot->stop1, stop1->stop2, ..., lastStop->depot
    const legDurations: number[] = new Array(legCount).fill(0);
    const legDistances: number[] = new Array(legCount).fill(0);
    if (segments && segments.length === legCount) {
      for (let i = 0; i < legCount; i++) {
        legDurations[i] = segments[i].duration ?? 0;
        legDistances[i] = segments[i].distance ?? 0;
      }
    }

    // Update positions + leg metrics
    let position = 1;
    // Build cursor for ETA: Routendatum + Startzeit als Europe/Berlin lokal interpretieren
    const startTime = (route.start_time as string | null)?.slice(0, 5) ?? "09:00";
    let cursorMs = berlinLocalToUtcMs(route.datum as string, startTime);
    if (isNaN(cursorMs)) cursorMs = Date.now();
    for (const s of orderedStops) {
      const legDur = legDurations[position - 1] ?? 0;
      const legDist = legDistances[position - 1] ?? 0;
      cursorMs += legDur * 1000;
      const etaIso = new Date(cursorMs).toISOString();
      await admin.from("route_stops").update({
        position,
        leg_distance_m: legDist ? Math.round(legDist) : null,
        leg_duration_s: legDur ? Math.round(legDur) : null,
        eta: etaIso,
      }).eq("id", s.id);
      // Service-Zeit am Stopp einrechnen
      cursorMs += stopDurationSec * 1000;
      position += 1;
    }

    const totalDist = legDistances.reduce((a, b) => a + b, 0);
    const drivingDur = legDurations.reduce((a, b) => a + b, 0);
    // Gesamtdauer = Fahrzeit + Service-Zeit aller Stopps
    const totalDur = drivingDur + orderedStops.length * stopDurationSec;

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
      stops_optimized: free.length,
      pinned_count: pinned.length,
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

// Interpret a "YYYY-MM-DD" + "HH:mm" pair as Europe/Berlin local time and
// return the corresponding UTC milliseconds. Handles CET/CEST automatically.
function berlinLocalToUtcMs(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  // Start with the wall-clock interpreted as UTC, then correct by the actual
  // Europe/Berlin offset at that instant.
  const utcGuess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0);
  const offsetMin = berlinOffsetMinutes(new Date(utcGuess));
  return utcGuess - offsetMin * 60_000;
}

function berlinOffsetMinutes(at: Date): number {
  // Format the instant as Berlin wall-clock parts and diff against the same parts as UTC.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}