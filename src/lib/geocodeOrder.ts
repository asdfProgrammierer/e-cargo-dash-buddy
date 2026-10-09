import { supabase } from "@/integrations/supabase/client";

export type GeocodeQuality = "exact" | "approximate";

export interface GeocodeResult {
  lat: number;
  lng: number;
  quality: GeocodeQuality;
  note: string | null;
}

/**
 * Geocode an order's recipient address and store coordinates plus the
 * match quality. Approximate matches (wrong/missing house number, other
 * postcode) are saved but flagged so the admin can review them.
 */
export async function geocodeAndSaveOrder(
  orderId: string,
  address: { strasse?: string | null; plz?: string | null; stadt?: string | null },
): Promise<GeocodeResult | null> {
  const { data, error } = await supabase.functions.invoke("geocode-address", {
    body: {
      strasse: address.strasse ?? "",
      plz: address.plz ?? "",
      stadt: address.stadt ?? "",
    },
  });
  if (error || !data || data.error || data.lat == null || data.lng == null) return null;
  const quality: GeocodeQuality = data.quality === "exact" ? "exact" : "approximate";
  const note: string | null = data.note ?? null;
  const { error: upErr } = await supabase
    .from("orders")
    .update({
      lat: data.lat,
      lng: data.lng,
      geocoded_at: new Date().toISOString(),
      geocode_quality: quality,
      geocode_note: note,
    })
    .eq("id", orderId);
  if (upErr) throw upErr;
  return { lat: data.lat, lng: data.lng, quality, note };
}
