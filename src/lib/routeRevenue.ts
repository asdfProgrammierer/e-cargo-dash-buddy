/** Pure per-tour revenue estimate (planned at creation, actual after completion). Same price rules as profitability.ts. */
import type { MerchantPrices } from "./profitability";

export interface RouteRevenueStop {
  merchant_id: string;
  pakete: number;
  /** stop was driven to (delivered or skipped) */
  served: boolean;
  /** first stop this order ever had → packages billed once */
  billPackages: boolean;
}

export interface RouteRevenue { packages: number; stops: number; hours: number; daily: number; total: number }

export const quarterHoursUp = (h: number) => Math.ceil(h * 4 - 1e-9) / 4;

/**
 * mode "planned": every assigned stop counts, hours = planned tour duration.
 * mode "actual": only served stops count, hours = real working time.
 * Tagespauschale is counted in full for each merchant on the tour.
 */
export function routeRevenue(i: {
  stops: RouteRevenueStop[];
  hours: number;
  exclusiveMerchantId?: string | null;
  merchants: Record<string, MerchantPrices>;
  mode: "planned" | "actual";
}): RouteRevenue {
  const rev: RouteRevenue = { packages: 0, stops: 0, hours: 0, daily: 0, total: 0 };
  const billed = new Set<string>();
  for (const s of i.stops) {
    if (i.mode === "actual" && !s.served) continue;
    const p = i.merchants[s.merchant_id];
    billed.add(s.merchant_id);
    rev.stops += p?.stopppreis ?? 0;
    if (s.billPackages) rev.packages += (p?.paketpreis ?? 0) * s.pakete;
  }
  if (i.exclusiveMerchantId) billed.add(i.exclusiveMerchantId);
  const h = quarterHoursUp(Math.max(0, i.hours));
  for (const m of billed) {
    const p = i.merchants[m];
    rev.hours += (p?.stundenpreis ?? 0) * h;
    rev.daily += p?.tagespauschale ?? 0;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  rev.packages = r2(rev.packages); rev.stops = r2(rev.stops); rev.hours = r2(rev.hours); rev.daily = r2(rev.daily);
  rev.total = r2(rev.packages + rev.stops + rev.hours + rev.daily);
  return rev;
}
