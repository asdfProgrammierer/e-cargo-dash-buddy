// Auto-completes the German city for a 5-digit postcode via the free
// Zippopotam service. Results are cached in localStorage to avoid refetching.

const CACHE_KEY = "plzCity:v1";

type Cache = Record<string, string>;

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota errors */
  }
}

export function isCompletePostcode(plz: string | null | undefined): boolean {
  return /^\d{5}$/.test((plz ?? "").trim());
}

export async function lookupCityByPostcode(plz: string): Promise<string | null> {
  const code = plz.trim();
  if (!isCompletePostcode(code)) return null;

  const cache = readCache();
  if (cache[code] !== undefined) return cache[code] || null;

  try {
    const res = await fetch(`https://api.zippopotam.us/de/${code}`);
    if (!res.ok) {
      cache[code] = "";
      writeCache(cache);
      return null;
    }
    const json = (await res.json()) as { places?: { "place name"?: string }[] };
    const city = json.places?.[0]?.["place name"]?.trim() ?? "";
    cache[code] = city;
    writeCache(cache);
    return city || null;
  } catch {
    return null;
  }
}
