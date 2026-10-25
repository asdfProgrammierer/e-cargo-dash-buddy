/** Pure profit/loss of one tour and per stop (admin route detail). Same price & cost rules as profitability.ts. */
import { EMPLOYER_SURCHARGE, type MerchantPrices } from "./profitability";
import { quarterHoursUp } from "./routeRevenue";

export interface RouteProfitStop {
  id: string;
  merchant_id: string;
  pakete: number;
  served: boolean;
  billPackages: boolean;
  /** marginal detour seconds (way in + way out − direct); null when not optimized */
  detourSec: number | null;
  stopSec: number;
}

export interface StopProfit { id: string; revenue: number; cost: number; margin: number }
export interface RouteProfitResult {
  revenue: { packages: number; stops: number; hours: number; daily: number; total: number };
  costs: { wage: number; surcharge: number; vehicle: number; total: number };
  margin: number;
  marginPct: number | null;
  byMerchant: { id: string; name: string; stops: number; revenue: number; cost: number; margin: number }[];
  byStop: Record<string, StopProfit>;
  splitByDetour: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * mode "planned": all stops, planned hours. mode "actual": only served stops, real hours.
 * Vehicle fixed costs: one day's share (fix per month × 12 / 365) per tour.
 * Tour cost is split onto stops by marginal detour + stop time when every counted stop has it, else equally.
 * Hourly price and Tagespauschale of a merchant are spread evenly over that merchant's stops.
 */
export function routeProfit(i: {
  stops: RouteProfitStop[];
  hours: number;
  km: number;
  wage: number | null;
  vehicle: { fixPerMonth: number; costPerKm: number } | null;
  exclusiveMerchantId?: string | null;
  merchants: Record<string, MerchantPrices>;
  mode: "planned" | "actual";
}): RouteProfitResult {
  const stops = i.stops.filter((s) => i.mode === "planned" || s.served);
  const wage = (i.wage ?? 0) * i.hours;
  const surcharge = wage * EMPLOYER_SURCHARGE;
  const vehicle = i.vehicle ? i.vehicle.costPerKm * i.km + (i.vehicle.fixPerMonth * 12) / 365 : 0;
  const costTotal = wage + surcharge + vehicle;

  const splitByDetour = stops.length > 0 && stops.every((s) => s.detourSec != null && s.detourSec + s.stopSec > 0);
  const weight = (s: RouteProfitStop) => (splitByDetour ? s.detourSec! + s.stopSec : 1);
  const totalWeight = stops.reduce((a, s) => a + weight(s), 0);

  const rev = { packages: 0, stops: 0, hours: 0, daily: 0, total: 0 };
  const byStop: Record<string, StopProfit> = {};
  const perMerchant = new Map<string, RouteProfitStop[]>();
  for (const s of stops) {
    const p = i.merchants[s.merchant_id];
    const pk = s.billPackages ? (p?.paketpreis ?? 0) * s.pakete : 0;
    const st = p?.stopppreis ?? 0;
    rev.packages += pk; rev.stops += st;
    byStop[s.id] = { id: s.id, revenue: pk + st, cost: totalWeight > 0 ? (costTotal * weight(s)) / totalWeight : 0, margin: 0 };
    const arr = perMerchant.get(s.merchant_id) ?? [];
    arr.push(s); perMerchant.set(s.merchant_id, arr);
  }
  const billed = new Set(perMerchant.keys());
  if (i.exclusiveMerchantId) billed.add(i.exclusiveMerchantId);
  const h = quarterHoursUp(Math.max(0, i.hours));
  const extraByMerchant = new Map<string, number>();
  for (const m of billed) {
    const p = i.merchants[m];
    const hr = (p?.stundenpreis ?? 0) * h;
    const day = p?.tagespauschale ?? 0;
    rev.hours += hr; rev.daily += day;
    extraByMerchant.set(m, hr + day);
    const ms = perMerchant.get(m) ?? [];
    for (const s of ms) byStop[s.id].revenue += (hr + day) / ms.length;
  }
  for (const s of Object.values(byStop)) {
    s.revenue = r2(s.revenue); s.cost = r2(s.cost); s.margin = r2(s.revenue - s.cost);
  }
  rev.total = r2(rev.packages + rev.stops + rev.hours + rev.daily);
  rev.packages = r2(rev.packages); rev.stops = r2(rev.stops); rev.hours = r2(rev.hours); rev.daily = r2(rev.daily);

  const byMerchant = [...billed].map((m) => {
    const ms = perMerchant.get(m) ?? [];
    const revenue = ms.length ? ms.reduce((a, s) => a + byStop[s.id].revenue, 0) : extraByMerchant.get(m) ?? 0;
    const cost = ms.reduce((a, s) => a + byStop[s.id].cost, 0);
    return { id: m, name: i.merchants[m]?.name || "Unbekannt", stops: ms.length, revenue: r2(revenue), cost: r2(cost), margin: r2(revenue - cost) };
  }).sort((a, b) => a.margin - b.margin);

  const margin = r2(rev.total - costTotal);
  return {
    revenue: rev,
    costs: { wage: r2(wage), surcharge: r2(surcharge), vehicle: r2(vehicle), total: r2(costTotal) },
    margin,
    marginPct: rev.total > 0 ? Math.round((margin / rev.total) * 1000) / 10 : null,
    byMerchant, byStop, splitByDetour,
  };
}
