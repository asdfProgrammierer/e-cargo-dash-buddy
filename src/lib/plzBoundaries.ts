/**
 * Loads 5-digit German postcode boundaries (OpenStreetMap, via Overpass API)
 * and converts them into GeoJSON polygons. Results are cached in localStorage.
 */

type LngLat = [number, number];

const CACHE_KEY = "plzBoundaries:v1";
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

type PolygonGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

function readCache(): Record<string, PolygonGeometry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, PolygonGeometry>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, PolygonGeometry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota exceeded — ignore, we just lose the cache */
  }
}

/** Stitch unordered way geometries into closed rings. */
function stitchRings(ways: LngLat[][]): LngLat[][] {
  const pending = ways.filter((w) => w.length > 1).map((w) => [...w]);
  const rings: LngLat[][] = [];
  const key = (p: LngLat) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

  while (pending.length > 0) {
    let ring = pending.shift()!;
    let extended = true;
    while (extended && key(ring[0]) !== key(ring[ring.length - 1])) {
      extended = false;
      for (let i = 0; i < pending.length; i += 1) {
        const w = pending[i];
        const end = ring[ring.length - 1];
        if (key(w[0]) === key(end)) {
          ring = ring.concat(w.slice(1));
        } else if (key(w[w.length - 1]) === key(end)) {
          ring = ring.concat([...w].reverse().slice(1));
        } else {
          continue;
        }
        pending.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }

  return rings;
}

function ringsToGeometry(rings: LngLat[][]): PolygonGeometry | null {
  if (rings.length === 0) return null;
  if (rings.length === 1) return { type: "Polygon", coordinates: [rings[0]] };
  return { type: "MultiPolygon", coordinates: rings.map((r) => [r]) };
}

interface OverpassMember {
  type: string;
  role: string;
  geometry?: Array<{ lat: number; lon: number }>;
}
interface OverpassElement {
  type: string;
  tags?: Record<string, string>;
  members?: OverpassMember[];
  geometry?: Array<{ lat: number; lon: number }>;
}

async function queryOverpass(postcodes: string[], signal?: AbortSignal) {
  const filter = postcodes.join("|");
  const query = `[out:json][timeout:60];rel["boundary"="postal_code"]["postal_code"~"^(${filter})$"];out geom;`;

  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return (await res.json()) as { elements: OverpassElement[] };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Overpass nicht erreichbar");
}

/**
 * Returns a map postcode -> polygon geometry. Missing postcodes simply
 * do not appear in the result (no OSM boundary available).
 */
export async function fetchPostcodePolygons(
  postcodes: string[],
  signal?: AbortSignal,
): Promise<Record<string, PolygonGeometry>> {
  const unique = Array.from(new Set(postcodes.filter((p) => /^\d{5}$/.test(p))));
  if (unique.length === 0) return {};

  const cache = readCache();
  const result: Record<string, PolygonGeometry> = {};
  const missing: string[] = [];

  for (const pc of unique) {
    if (cache[pc]) result[pc] = cache[pc];
    else missing.push(pc);
  }

  const CHUNK = 60;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const data = await queryOverpass(chunk, signal);
    for (const el of data.elements ?? []) {
      const pc = el.tags?.postal_code;
      if (!pc) continue;
      const ways: LngLat[][] = (el.members ?? [])
        .filter((m) => m.type === "way" && (m.role === "outer" || m.role === "") && m.geometry)
        .map((m) => m.geometry!.map((p) => [p.lon, p.lat] as LngLat));
      const geometry = ringsToGeometry(stitchRings(ways));
      if (geometry) {
        result[pc] = geometry;
        cache[pc] = geometry;
      }
    }
  }

  writeCache(cache);
  return result;
}
