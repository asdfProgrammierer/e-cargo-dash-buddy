import { supabase } from "@/integrations/supabase/client";

const POSTCODE_PATTERN = /^\d{5}$/;

export function normalizePostcode(postcode?: string | null) {
  return postcode?.trim() ?? "";
}

export function isCheckablePostcode(postcode?: string | null) {
  return POSTCODE_PATTERN.test(normalizePostcode(postcode));
}

export function isCoveredPostcode(postcode: string, coveredPostcodes: Set<string>) {
  return coveredPostcodes.has(normalizePostcode(postcode));
}

export async function fetchCoveredPostcodes() {
  const { data, error } = await supabase
    .from("delivery_zone_postcodes")
    .select("postcode");

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((entry) => normalizePostcode(entry.postcode)).filter(Boolean));
}