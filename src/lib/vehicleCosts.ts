/** Pure cost math for vehicle hourly-rate statistics. */
export interface VehicleCostInput {
  fixPerMonth: number;
  costPerKm: number;
  days: number; // length of period in days (inclusive)
  hours: number; // actual working hours
  km: number;
  maintenance: number; // completed maintenance costs in period
}

export interface VehicleCostResult {
  fixed: number;
  variable: number;
  maintenance: number;
  total: number;
  perHour: number | null;
  perKm: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fixed costs are prorated by days: monthly amount × 12 / 365 per day. */
export function vehicleCosts(i: VehicleCostInput): VehicleCostResult {
  const fixed = round2((i.fixPerMonth * 12 * Math.max(0, i.days)) / 365);
  const variable = round2(i.costPerKm * i.km);
  const maintenance = round2(i.maintenance);
  const total = round2(fixed + variable + maintenance);
  return {
    fixed,
    variable,
    maintenance,
    total,
    perHour: i.hours > 0 ? round2(total / i.hours) : null,
    perKm: i.km > 0 ? round2(total / i.km) : null,
  };
}

export interface VehicleCostItem { intervall: "monat" | "jahr" | "km"; betrag: number }

/** Sums cost items into monthly fixed costs (yearly ÷ 12) and costs per km. */
export function sumCostItems(items: VehicleCostItem[]): { fixPerMonth: number; costPerKm: number } {
  let fix = 0, km = 0;
  for (const i of items) {
    const b = Number(i.betrag) || 0;
    if (i.intervall === "monat") fix += b;
    else if (i.intervall === "jahr") fix += b / 12;
    else km += b;
  }
  return { fixPerMonth: round2(fix), costPerKm: Math.round(km * 10000) / 10000 };
}

/** €/km from electricity price (€/kWh) and consumption (kWh per 100 km). */
export function energyCostPerKm(pricePerKwh: number, kwhPer100km: number): number {
  return Math.round(((pricePerKwh * kwhPer100km) / 100) * 10000) / 10000;
}
