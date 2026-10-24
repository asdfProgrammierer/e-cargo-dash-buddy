/** Pure revenue/cost math for the Kosten- & Ertragsanalyse (Statistiken → Kosten & Ertrag). */

export const EMPLOYER_SURCHARGE = 0.3; // 30 % Arbeitgeber-Aufschlag auf Bruttolohn

export interface MerchantPrices {
  name: string;
  paketpreis: number | null;
  stopppreis: number | null;
  stundenpreis: number | null;
  tagespauschale: number | null;
  grundbeitrag_monat: number | null;
}

export interface RouteIn {
  id: string;
  datum: string;
  driver_id: string | null;
  vehicle_id: string | null;
  exclusive_merchant_user_id: string | null;
  hours: number;
  km: number;
}

export interface StopIn {
  route_id: string;
  order_id: string;
  merchant_id: string;
  pakete: number;
  /** true when the stop was actually driven to (delivered or skipped). */
  served: boolean;
  /** true when this stop is the first route stop this order ever had — packages are billed once. */
  billPackages: boolean;
  /** Seconds of marginal detour (way in + way out − direct) plus stop time; null when unknown. */
  costWeight?: number | null;
}

export interface VehicleIn { fixPerMonth: number; costPerKm: number; maintenance: number }

export interface ProfitInput {
  days: number;
  routes: RouteIn[];
  stops: StopIn[];
  merchants: Record<string, MerchantPrices>;
  wages: Record<string, number | null>; // driver_id -> €/h brutto
  vehicles: Record<string, VehicleIn>;
  driverFilter?: string[] | null;
  /** Selected merchant ids; null/undefined = all merchants. */
  merchantFilter?: string[] | null;
}

export interface Revenue { packages: number; stops: number; hours: number; daily: number; base: number; total: number }
export interface Costs { wage: number; surcharge: number; vehicle: number; total: number }
export interface Row {
  id: string;
  name: string;
  routes: number;
  hours: number;
  km: number;
  stops: number;
  packages: number;
  days: number;
  revenue: Revenue;
  costs: Costs;
  margin: number;
}
export interface ProfitResult {
  revenue: Revenue;
  costs: Costs;
  margin: number;
  marginPct: number | null;
  byMerchant: Row[];
  byDriver: Row[];
  missingWages: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const zeroRev = (): Revenue => ({ packages: 0, stops: 0, hours: 0, daily: 0, base: 0, total: 0 });
const zeroCost = (): Costs => ({ wage: 0, surcharge: 0, vehicle: 0, total: 0 });

export function analyzeProfit(i: ProfitInput): ProfitResult {
  const routesById = new Map(i.routes.map((r) => [r.id, r]));
  const served = i.stops.filter((s) => s.served && routesById.has(s.route_id));

  // --- route cost (driver wage + 30 % + vehicle share) ---
  const vehicleHours = new Map<string, number>();
  for (const r of i.routes) if (r.vehicle_id) vehicleHours.set(r.vehicle_id, (vehicleHours.get(r.vehicle_id) ?? 0) + r.hours);
  const routeCost = new Map<string, Costs>();
  for (const r of i.routes) {
    const wage = r.driver_id ? (i.wages[r.driver_id] ?? 0) * r.hours : 0;
    const surcharge = wage * EMPLOYER_SURCHARGE;
    let vehicle = 0;
    const v = r.vehicle_id ? i.vehicles[r.vehicle_id] : undefined;
    if (v) {
      const fixedPeriod = (v.fixPerMonth * 12 * i.days) / 365 + v.maintenance;
      const vh = vehicleHours.get(r.vehicle_id!) ?? 0;
      vehicle = v.costPerKm * r.km + (vh > 0 ? (fixedPeriod * r.hours) / vh : 0);
    }
    routeCost.set(r.id, { wage, surcharge, vehicle, total: wage + surcharge + vehicle });
  }

  // --- per route & merchant revenue ---
  type Cell = { rev: Revenue; stops: number; packages: number; weight: number };
  const cells = new Map<string, Map<string, Cell>>(); // route -> merchant -> cell
  const cell = (routeId: string, m: string) => {
    let rm = cells.get(routeId);
    if (!rm) cells.set(routeId, (rm = new Map()));
    let c = rm.get(m);
    if (!c) rm.set(m, (c = { rev: zeroRev(), stops: 0, packages: 0, weight: 0 }));
    return c;
  };
  // Cost split: by marginal detour time when every served stop of a route has it, else by stop count.
  const detourOk = new Map<string, boolean>();
  for (const s of served) detourOk.set(s.route_id, (detourOk.get(s.route_id) ?? true) && s.costWeight != null && s.costWeight > 0);
  for (const s of served) {
    const p = i.merchants[s.merchant_id];
    const c = cell(s.route_id, s.merchant_id);
    c.stops += 1;
    c.weight += detourOk.get(s.route_id) ? s.costWeight! : 1;
    c.rev.stops += p?.stopppreis ?? 0;
    if (s.billPackages) {
      c.packages += s.pakete;
      c.rev.packages += (p?.paketpreis ?? 0) * s.pakete;
    }
  }
  // Stundenpreis: a merchant with an hourly rate is billed the whole tour duration
  // whenever one of its stops is on that tour (or the tour is exclusive for it).
  for (const r of i.routes) {
    const billed = new Set<string>(cells.get(r.id)?.keys() ?? []);
    if (r.exclusive_merchant_user_id) billed.add(r.exclusive_merchant_user_id);
    for (const m of billed) {
      const rate = i.merchants[m]?.stundenpreis ?? 0;
      // Billed tour time is rounded up to the next quarter hour per tour.
      if (rate > 0) cell(r.id, m).rev.hours += rate * (Math.ceil(r.hours * 4 - 1e-9) / 4);
    }
  }
  // Tagespauschale: once per merchant & day, split across that day's routes by stop count.
  const dayGroups = new Map<string, { routeId: string; weight: number }[]>();
  for (const [routeId, rm] of cells) {
    const d = routesById.get(routeId)!.datum;
    for (const [m, c] of rm) {
      const k = `${m}|${d}`;
      const arr = dayGroups.get(k) ?? [];
      arr.push({ routeId, weight: Math.max(c.stops, 0) });
      dayGroups.set(k, arr);
    }
  }
  const merchantDays = new Map<string, number>();
  for (const [k, arr] of dayGroups) {
    const m = k.split("|")[0];
    merchantDays.set(m, (merchantDays.get(m) ?? 0) + 1);
    const fee = i.merchants[m]?.tagespauschale ?? 0;
    const total = arr.reduce((a, x) => a + x.weight, 0);
    for (const x of arr) cell(x.routeId, m).rev.daily += total > 0 ? (fee * x.weight) / total : fee / arr.length;
  }

  // --- apply filters & aggregate ---
  const mSet = i.merchantFilter ? new Set(i.merchantFilter) : null;
  const dSet = i.driverFilter ? new Set(i.driverFilter) : null;
  const driverOk = (r: RouteIn) => !dSet || (r.driver_id != null && dSet.has(r.driver_id));
  const merchantRows = new Map<string, Row>();
  const driverRows = new Map<string, Row>();
  const newRow = (id: string, name: string): Row => ({ id, name, routes: 0, hours: 0, km: 0, stops: 0, packages: 0, days: 0, revenue: zeroRev(), costs: zeroCost(), margin: 0 });
  const addRev = (a: Revenue, b: Revenue, f = 1) => { a.packages += b.packages * f; a.stops += b.stops * f; a.hours += b.hours * f; a.daily += b.daily * f; a.base += b.base * f; };
  const addCost = (a: Costs, b: Costs, f = 1) => { a.wage += b.wage * f; a.surcharge += b.surcharge * f; a.vehicle += b.vehicle * f; };
  const totalRev = zeroRev();
  const totalCost = zeroCost();

  for (const r of i.routes) {
    if (!driverOk(r)) continue;
    const rm = cells.get(r.id) ?? new Map<string, Cell>();
    const cost = routeCost.get(r.id)!;
    const routeWeight = [...rm.values()].reduce((a, c) => a + c.weight, 0);
    const dId = r.driver_id ?? "none";
    const dRow = driverRows.get(dId) ?? newRow(dId, "");
    driverRows.set(dId, dRow);

    // share of this route's cost attributable to the merchant filter
    let share = 1;
    if (mSet) {
      if (r.exclusive_merchant_user_id) share = mSet.has(r.exclusive_merchant_user_id) ? 1 : 0;
      else share = routeWeight > 0 ? [...rm].reduce((a, [m, c]) => a + (mSet.has(m) ? c.weight : 0), 0) / routeWeight : 0;
      if (share === 0 && ![...rm.keys()].some((m) => mSet.has(m))) continue;
    }
    dRow.routes += 1;
    dRow.hours += r.hours * share;
    dRow.km += r.km * share;
    addCost(dRow.costs, cost, share);
    addCost(totalCost, cost, share);

    for (const [m, c] of rm) {
      if (mSet && !mSet.has(m)) continue;
      addRev(dRow.revenue, c.rev);
      addRev(totalRev, c.rev);
      dRow.stops += c.stops;
      dRow.packages += c.packages;
      const mRow = merchantRows.get(m) ?? newRow(m, i.merchants[m]?.name ?? "Unbekannt");
      merchantRows.set(m, mRow);
      addRev(mRow.revenue, c.rev);
      mRow.stops += c.stops;
      mRow.packages += c.packages;
      const mShare = r.exclusive_merchant_user_id ? (r.exclusive_merchant_user_id === m ? 1 : 0) : routeWeight > 0 ? c.weight / routeWeight : 0;
      addCost(mRow.costs, cost, mShare);
      mRow.hours += r.hours * mShare;
      mRow.km += r.km * mShare;
      if (mShare > 0) mRow.routes += 1;
    }
  }

  // Grundbeitrag: a merchant-level monthly fee, not attributable to a driver.
  if (i.driverFilter == null) {
    for (const [m, p] of Object.entries(i.merchants)) {
      if (mSet && !mSet.has(m)) continue;
      const base = ((p.grundbeitrag_monat ?? 0) * 12 * i.days) / 365;
      if (base <= 0) continue;
      const mRow = merchantRows.get(m) ?? newRow(m, p.name);
      merchantRows.set(m, mRow);
      mRow.revenue.base += base;
      totalRev.base += base;
    }
    // Fixed costs of vehicles that drove no route in the period still count for the fleet.
    if (!mSet) {
      for (const [vid, v] of Object.entries(i.vehicles)) {
        if ((vehicleHours.get(vid) ?? 0) > 0) continue;
        totalCost.vehicle += (v.fixPerMonth * 12 * i.days) / 365 + v.maintenance;
      }
    }
  }

  const finish = (row: Row) => {
    row.days = merchantDays.get(row.id) ?? row.days;
    for (const k of Object.keys(row.revenue) as (keyof Revenue)[]) row.revenue[k] = r2(row.revenue[k]);
    row.revenue.total = r2(row.revenue.packages + row.revenue.stops + row.revenue.hours + row.revenue.daily + row.revenue.base);
    for (const k of Object.keys(row.costs) as (keyof Costs)[]) row.costs[k] = r2(row.costs[k]);
    row.costs.total = r2(row.costs.wage + row.costs.surcharge + row.costs.vehicle);
    row.hours = r2(row.hours);
    row.km = r2(row.km);
    row.margin = r2(row.revenue.total - row.costs.total);
    return row;
  };
  for (const k of Object.keys(totalRev) as (keyof Revenue)[]) totalRev[k] = r2(totalRev[k]);
  totalRev.total = r2(totalRev.packages + totalRev.stops + totalRev.hours + totalRev.daily + totalRev.base);
  for (const k of Object.keys(totalCost) as (keyof Costs)[]) totalCost[k] = r2(totalCost[k]);
  totalCost.total = r2(totalCost.wage + totalCost.surcharge + totalCost.vehicle);
  const margin = r2(totalRev.total - totalCost.total);

  const byDriver = [...driverRows.values()].filter((d) => d.routes > 0).map((d) => { d.days = 0; return finish(d); });
  const missingWages = byDriver.filter((d) => d.id !== "none" && i.wages[d.id] == null).map((d) => d.id);

  return {
    revenue: totalRev,
    costs: totalCost,
    margin,
    marginPct: totalRev.total > 0 ? r2((margin / totalRev.total) * 100) : null,
    byMerchant: [...merchantRows.values()].map(finish).sort((a, b) => b.revenue.total - a.revenue.total),
    byDriver: byDriver.sort((a, b) => b.revenue.total - a.revenue.total),
    missingWages,
  };
}
