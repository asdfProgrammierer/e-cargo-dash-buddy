import { normalizePostcode } from "@/lib/deliveryCoverage";

export interface ZoneInfo {
  id: string;
  name: string;
  label: string;
  color: string | null;
  sort_order: number;
}

export interface ZoneWithPostcodes extends ZoneInfo {
  postcodes: string[];
}

/** Build a Map<postcode, ZoneInfo> for fast lookups. */
export function buildPostcodeZoneMap(zones: ZoneWithPostcodes[]): Map<string, ZoneInfo> {
  const map = new Map<string, ZoneInfo>();
  for (const z of zones) {
    const info: ZoneInfo = {
      id: z.id,
      name: z.name,
      label: z.label,
      color: z.color,
      sort_order: z.sort_order,
    };
    for (const pc of z.postcodes) {
      const norm = normalizePostcode(pc);
      if (norm) map.set(norm, info);
    }
  }
  return map;
}

export function zoneInfoFor(
  postcode: string | null | undefined,
  byPostcode: Map<string, ZoneInfo>,
): ZoneInfo | null {
  const norm = normalizePostcode(postcode ?? "");
  if (!norm) return null;
  return byPostcode.get(norm) ?? null;
}

/** Sentinel id used in the filter set to represent "no zone" entries. */
export const NO_ZONE_ID = "__none__";