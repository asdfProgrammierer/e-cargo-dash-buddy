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

type Quality = "exact" | "approximate";

interface Candidate {
  lat: number;
  lng: number;
  formatted: string;
  housenumber: string | null;
  postcode: string | null;
  provider: string;
  layer: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Expand German street abbreviations: "Universitätsstr. 114" → "Universitätsstraße 114". */
export function expandStreet(s: string | undefined): string {
  return (s ?? "")
    .replace(/\b(S|s)tr\.?(?=\s|\d|,|$)/g, (_m, c) => (c === "S" ? "Straße" : "straße"))
    .replace(/([a-zäöüß])str\.?(?=\s|\d|,|$)/gi, "$1straße")
    .replace(/\s+/g, " ")
    .trim();
}

const normNum = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "").toLowerCase();

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("ORS_API_KEY");
    const body = (await req.json()) as GeocodeRequest;

    const street = expandStreet(body.strasse);
    const plz = (body.plz ?? "").trim();
    const stadt = (body.stadt ?? "").trim();
    const text = body.query
      ? body.query
      : [street, plz, stadt, body.land ?? "Deutschland"].filter(Boolean).join(", ").trim();
    if (!text) return json({ error: "Adresse fehlt" }, 400);

    const wantedNum = normNum(street.match(/\d+\s?[a-zA-Z]?(?=\s|$|,|-|\/)/)?.[0] ?? street.match(/\d+/)?.[0]);
    const wantsHouseNumber = !!wantedNum;

    /** Classify a candidate: exact only if house number AND postcode match. */
    const classify = (c: Candidate): { quality: Quality; note: string | null } => {
      if (plz && c.postcode && c.postcode !== plz) {
        return { quality: "approximate", note: `Gefundene PLZ ${c.postcode} weicht von ${plz} ab` };
      }
      if (!wantsHouseNumber) {
        return { quality: "approximate", note: "Keine Hausnummer angegeben – Position nur ungefähr" };
      }
      if (!c.housenumber) {
        return { quality: "approximate", note: "Hausnummer nicht gefunden – nur Straße/Ort verortet" };
      }
      // House number ranges ("32-34") count as a match for any number they start with.
      const got = normNum(c.housenumber.split(/[-–\/]/)[0]);
      if (got !== wantedNum && got.replace(/[a-z]$/, "") !== wantedNum.replace(/[a-z]$/, "")) {
        return { quality: "approximate", note: `Andere Hausnummer gefunden (${c.housenumber})` };
      }
      return { quality: "exact", note: null };
    };

    const candidates: Candidate[] = [];

    // 1) OpenRouteService (Pelias)
    if (apiKey) {
      for (const layers of ["address", undefined]) {
        try {
          const url = new URL("https://api.openrouteservice.org/geocode/search");
          url.searchParams.set("api_key", apiKey);
          url.searchParams.set("text", text);
          url.searchParams.set("size", "5");
          url.searchParams.set("boundary.country", "DEU");
          if (layers) url.searchParams.set("layers", layers);
          const r = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
          if (!r.ok) {
            console.warn(`[geocode] ORS ${r.status}`);
            break;
          }
          const j = await r.json();
          for (const f of (j?.features ?? []) as any[]) {
            const p = f?.properties ?? {};
            // Skip city/region centroids – useless for delivery routing.
            if (["locality", "localadmin", "county", "region", "macroregion", "country"].includes(p.layer)) continue;
            if (p.accuracy === "centroid" && !p.street) continue;
            const [lng, lat] = f.geometry.coordinates;
            candidates.push({
              lat, lng,
              formatted: p.label ?? text,
              housenumber: p.housenumber ?? null,
              postcode: p.postalcode ?? null,
              provider: "ors",
              layer: p.layer ?? null,
            });
          }
          if (candidates.some((c) => classify(c).quality === "exact")) break;
        } catch (e) {
          console.warn("[geocode] ORS failed", e);
        }
      }
    }

    // 2) Nominatim (OSM)
    if (!candidates.some((c) => classify(c).quality === "exact")) {
      try {
        const u = new URL("https://nominatim.openstreetmap.org/search");
        u.searchParams.set("format", "json");
        u.searchParams.set("limit", "5");
        u.searchParams.set("countrycodes", "de");
        u.searchParams.set("addressdetails", "1");
        u.searchParams.set("email", "kontakt@ecargo-logistik.de");
        if (!body.query && (street || plz || stadt)) {
          if (street) u.searchParams.set("street", street);
          if (stadt) u.searchParams.set("city", stadt);
          if (plz) u.searchParams.set("postalcode", plz);
        } else {
          u.searchParams.set("q", text);
        }
        const r = await fetchWithTimeout(u.toString(), {
          headers: {
            Accept: "application/json",
            "User-Agent": "e-cargo-logistik/1.0 (kontakt@ecargo-logistik.de)",
            Referer: "https://ecargo-connect.ecargo-logistik.de",
          },
        });
        if (!r.ok) console.warn(`[geocode] nominatim ${r.status}`);
        else {
          for (const h of (await r.json()) as any[]) {
            if (!h?.lat || !h?.lon) continue;
            candidates.push({
              lat: Number(h.lat),
              lng: Number(h.lon),
              formatted: h.display_name ?? text,
              housenumber: h?.address?.house_number ?? null,
              postcode: h?.address?.postcode ?? null,
              provider: "nominatim",
              layer: h.addresstype ?? h.class ?? null,
            });
          }
        }
      } catch (e) {
        console.warn("[geocode] nominatim failed", e);
      }
    }

    // 3) Photon (komoot, OSM-based)
    if (!candidates.some((c) => classify(c).quality === "exact")) {
      try {
        const u = new URL("https://photon.komoot.io/api/");
        u.searchParams.set("q", text);
        u.searchParams.set("limit", "5");
        u.searchParams.set("lang", "de");
        const r = await fetchWithTimeout(u.toString(), {
          headers: { Accept: "application/json", "User-Agent": "e-cargo-logistik/1.0" },
        });
        if (!r.ok) console.warn(`[geocode] photon ${r.status}`);
        else {
          const j = await r.json();
          for (const f of (j?.features ?? []) as any[]) {
            const p = f?.properties ?? {};
            if ((p.countrycode ?? "").toUpperCase() !== "DE") continue;
            if (["city", "county", "state", "country", "district"].includes(p.type)) continue;
            const [lng, lat] = f.geometry.coordinates;
            candidates.push({
              lat, lng,
              formatted:
                [p.street && `${p.street} ${p.housenumber ?? ""}`.trim(), [p.postcode, p.city].filter(Boolean).join(" ")]
                  .filter(Boolean).join(", ") || text,
              housenumber: p.housenumber ?? null,
              postcode: p.postcode ?? null,
              provider: "photon",
              layer: p.type ?? null,
            });
          }
        }
      } catch (e) {
        console.warn("[geocode] photon failed", e);
      }
    }

    if (!candidates.length) {
      console.warn(`[geocode] no result for "${text}"`);
      return json({ error: "Keine Treffer für Adresse" }, 404);
    }

    // Pick best: exact > house number + matching PLZ > matching PLZ > anything
    const score = (c: Candidate) => {
      const { quality } = classify(c);
      if (quality === "exact") return 3;
      const plzOk = !plz || !c.postcode || c.postcode === plz;
      if (c.housenumber && plzOk) return 2;
      if (plzOk) return 1;
      return 0;
    };
    const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
    const { quality, note } = classify(best);
    if (quality !== "exact") console.warn(`[geocode] approximate "${text}" → ${best.provider}: ${note}`);

    return json({
      lat: best.lat,
      lng: best.lng,
      formatted: best.formatted,
      provider: best.provider,
      layer: best.layer,
      quality,
      note,
      // legacy fields
      confidence: null,
      matchType: quality === "exact" ? "exact" : "fallback",
    });
  } catch (err) {
    console.error("geocode-address error", err);
    return json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }, 500);
  }
});
