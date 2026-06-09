import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeocodeRequest {
  strasse?: string;
  plz?: string;
  stadt?: string;
  land?: string;
  query?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ORS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ORS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as GeocodeRequest;
    // Expand common German street abbreviations so the geocoder finds the
    // exact house number instead of falling back to a street centroid.
    const expandStreet = (s: string | undefined) =>
      (s ?? "")
        .replace(/\bStr\.?\b/gi, "Straße")
        .replace(/\bstr\.?\b/g, "straße")
        .trim();

    const queryParts = body.query
      ? [body.query]
      : [expandStreet(body.strasse), body.plz, body.stadt, body.land ?? "Deutschland"].filter(Boolean);
    const text = queryParts.join(", ").trim();

    if (!text) {
      return new Response(JSON.stringify({ error: "Adresse fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Prefer precise address-level matches; 2) fall back to any match.
    const fetchFeatures = async (layers?: string) => {
      const url = new URL("https://api.openrouteservice.org/geocode/search");
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("text", text);
      url.searchParams.set("size", "5");
      url.searchParams.set("boundary.country", "DEU");
      if (layers) url.searchParams.set("layers", layers);
      const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!r.ok) return null;
      const j = await r.json();
      return (j?.features ?? []) as any[];
    };

    let features = (await fetchFeatures("address")) ?? [];
    if (!features.length) features = (await fetchFeatures()) ?? [];
    // Prefer features that include a house number when one was requested.
    const wantsHouseNumber = /\d/.test(body.strasse ?? "");
    const feature =
      (wantsHouseNumber && features.find((f) => f?.properties?.housenumber)) ||
      features[0];
    if (!feature) {
      return new Response(JSON.stringify({ error: "Keine Treffer für Adresse" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [lng, lat] = feature.geometry.coordinates;
    const formatted = feature.properties?.label ?? text;
    const confidence = feature.properties?.confidence ?? null;
    const matchType = feature.properties?.match_type ?? null;
    const layer = feature.properties?.layer ?? null;

    return new Response(
      JSON.stringify({ lat, lng, formatted, confidence, matchType, layer }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("geocode-address error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});