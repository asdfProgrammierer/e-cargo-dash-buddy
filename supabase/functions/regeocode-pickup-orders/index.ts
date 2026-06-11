import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function geocode(strasse: string, plz: string, stadt: string): Promise<{ lat: number; lng: number } | null> {
  const expandStreet = (s: string) =>
    s.replace(/\bStr\.?\b/gi, "Straße").replace(/\bstr\.?\b/g, "straße").trim();
  const cleanStreet = expandStreet(strasse ?? "");
  const text = [cleanStreet, plz, stadt, "Deutschland"].filter(Boolean).join(", ").trim();
  if (!text) return null;

  // 1) ORS Pelias (fast, sometimes misses residential addresses)
  const apiKey = Deno.env.get("ORS_API_KEY");
  if (apiKey) {
    try {
      const url = new URL("https://api.openrouteservice.org/geocode/search");
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("text", text);
      url.searchParams.set("size", "1");
      url.searchParams.set("boundary.country", "DEU");
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        const feature = data?.features?.[0];
        if (feature) {
          const [lng, lat] = feature.geometry.coordinates;
          if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
        }
      }
    } catch (e) {
      console.warn("regeocode ORS failed", e);
    }
  }

  // 2) Nominatim fallback (much better recall for German residential addresses)
  try {
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("format", "json");
    u.searchParams.set("limit", "1");
    u.searchParams.set("countrycodes", "de");
    if (cleanStreet) u.searchParams.set("street", cleanStreet);
    if (stadt) u.searchParams.set("city", stadt);
    if (plz) u.searchParams.set("postalcode", plz);
    if (!cleanStreet && !plz && !stadt) u.searchParams.set("q", text);
    const res = await fetch(u.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "e-cargo-logistik/1.0 (kontakt@ecargo-logistik.de)",
      },
    });
    if (res.ok) {
      const arr = (await res.json()) as any[];
      const hit = arr?.[0];
      if (hit?.lat && hit?.lon) return { lat: Number(hit.lat), lng: Number(hit.lon) };
    }
  } catch (e) {
    console.warn("regeocode Nominatim failed", e);
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth: only admins may run this
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find ALL orders (pickup and delivery) without coordinates so admins
    // don't have to manually geocode anything.
    const { data: orders, error: oErr } = await supabase
      .from("orders")
      .select("id, empfaenger_adresse, empfaenger_plz, empfaenger_stadt")
      .or("lat.is.null,lng.is.null")
      .limit(200);

    if (oErr) throw oErr;

    let updated = 0;
    let failed = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (const o of orders ?? []) {
      const geo = await geocode(o.empfaenger_adresse ?? "", o.empfaenger_plz ?? "", o.empfaenger_stadt ?? "");
      if (!geo) {
        failed++;
        failures.push({ id: o.id, reason: "no_geo" });
        continue;
      }
      const { error: uErr } = await supabase
        .from("orders")
        .update({ lat: geo.lat, lng: geo.lng, geocoded_at: new Date().toISOString() })
        .eq("id", o.id);
      if (uErr) {
        failed++;
        failures.push({ id: o.id, reason: uErr.message });
      } else {
        updated++;
      }
    }

    return new Response(
      JSON.stringify({ total: orders?.length ?? 0, updated, failed, failures }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("regeocode-pickup-orders error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});