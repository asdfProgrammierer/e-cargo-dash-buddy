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
    // ORS sometimes has slow TCP connects from edge runtime — use an
    // AbortController timeout plus one retry so transient timeouts don't 500.
    const fetchWithTimeout = async (url: string, timeoutMs: number) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        return await fetch(url, {
          headers: { Accept: "application/json" },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    };
    const fetchFeatures = async (layers?: string) => {
      const url = new URL("https://api.openrouteservice.org/geocode/search");
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("text", text);
      url.searchParams.set("size", "5");
      url.searchParams.set("boundary.country", "DEU");
      if (layers) url.searchParams.set("layers", layers);
      const u = url.toString();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetchWithTimeout(u, 8000);
          if (!r.ok) return null;
          const j = await r.json();
          return (j?.features ?? []) as any[];
        } catch (e) {
          console.warn(`[geocode] attempt ${attempt + 1} failed`, e);
          if (attempt === 1) return null;
        }
      }
      return null;
    };

    let features = (await fetchFeatures("address")) ?? [];
    if (!features.length) features = (await fetchFeatures()) ?? [];
    // Prefer features that include a house number when one was requested.
    const wantsHouseNumber = /\d/.test(body.strasse ?? "");
    const feature =
      (wantsHouseNumber && features.find((f) => f?.properties?.housenumber)) ||
      features[0];
    if (feature) {
      const [lng, lat] = feature.geometry.coordinates;
      const formatted = feature.properties?.label ?? text;
      const confidence = feature.properties?.confidence ?? null;
      const matchType = feature.properties?.match_type ?? null;
      const layer = feature.properties?.layer ?? null;
      return new Response(
        JSON.stringify({ lat, lng, formatted, confidence, matchType, layer, provider: "ors" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fallback: Nominatim (OpenStreetMap). Free, no API key, much better
    // recall for German residential addresses than ORS/Pelias.
    try {
      const nomUrl = new URL("https://nominatim.openstreetmap.org/search");
      nomUrl.searchParams.set("format", "json");
      nomUrl.searchParams.set("limit", "5");
      nomUrl.searchParams.set("countrycodes", "de");
      nomUrl.searchParams.set("addressdetails", "1");
      if (body.strasse || body.plz || body.stadt) {
        if (body.strasse) nomUrl.searchParams.set("street", expandStreet(body.strasse));
        if (body.stadt) nomUrl.searchParams.set("city", body.stadt);
        if (body.plz) nomUrl.searchParams.set("postalcode", body.plz);
      } else {
        nomUrl.searchParams.set("q", text);
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const nomRes = await fetch(nomUrl.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "e-cargo-logistik/1.0 (kontakt@ecargo-logistik.de)",
        },
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      if (nomRes && nomRes.ok) {
        const arr = (await nomRes.json()) as any[];
        // Prefer hit with matching housenumber when one was requested
        const wantedNum = (body.strasse ?? "").match(/\d+\w?/)?.[0]?.toLowerCase();
        const pick =
          (wantedNum && arr.find((h) => (h?.address?.house_number ?? "").toLowerCase() === wantedNum)) ||
          arr[0];
        if (pick && pick.lat && pick.lon) {
          return new Response(
            JSON.stringify({
              lat: Number(pick.lat),
              lng: Number(pick.lon),
              formatted: pick.display_name ?? text,
              confidence: null,
              matchType: pick?.address?.house_number ? "exact" : "interpolated",
              layer: pick.class ?? null,
              provider: "nominatim",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } catch (e) {
      console.warn("[geocode] nominatim fallback failed", e);
    }

    return new Response(JSON.stringify({ error: "Keine Treffer für Adresse" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("geocode-address error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});