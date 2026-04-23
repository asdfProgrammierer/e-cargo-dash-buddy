import { z } from "zod";

export const postcodeSchema = z.string().trim().regex(/^\d{5}$/, "PLZ muss aus genau 5 Ziffern bestehen");

export const deliveryZoneSchema = z.object({
  name: z.string().trim().min(1, "Zonenname ist erforderlich").max(80, "Zonenname ist zu lang"),
  label: z.string().trim().min(1, "Zonenkürzel ist erforderlich").max(24, "Zonenkürzel ist zu lang"),
  color: z.string().trim().max(32, "Farbwert ist zu lang").optional().or(z.literal("")),
  description: z.string().trim().max(240, "Beschreibung ist zu lang").optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0, "Reihenfolge muss positiv sein").max(999, "Reihenfolge ist zu groß"),
  active: z.boolean(),
  postcodesText: z.string().trim(),
});

export type DeliveryZoneFormValues = z.infer<typeof deliveryZoneSchema>;

export type DeliveryZoneRecord = {
  id: string;
  name: string;
  label: string;
  color: string | null;
  description: string | null;
  sort_order: number;
  active: boolean;
  delivery_zone_postcodes?: Array<{
    id: string;
    postcode: string;
  }>;
};

export function parsePostcodes(input: string) {
  const tokens = input
    .split(/[\s,;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(tokens));

  for (const postcode of unique) {
    postcodeSchema.parse(postcode);
  }

  return unique.sort((a, b) => a.localeCompare(b, "de"));
}

export function formatPostcodes(postcodes: string[]) {
  return postcodes.join(", ");
}

export function getZoneBadgeStyle(color?: string | null) {
  if (!color) return undefined;

  return {
    backgroundColor: `${color}22`,
    borderColor: `${color}55`,
    color,
  };
}