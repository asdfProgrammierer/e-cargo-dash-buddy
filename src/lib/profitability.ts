/** Pure revenue/cost math for the Kosten- & Ertragsanalyse. */

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
}

export interface VehicleIn { fixPerMonth: number; costPerKm: number; maintenance: number }

export interface ProfitInput {
  days: number;
  routes: RouteIn[];
  stops: StopIn[];
  merchants: Record<string, MerchantPrices>;
  wages: Record<string, number | null>; // driver_id -> €/h brutto
  vehicles: Record<string, VehicleIn>;
  driverFilter?: string | null;
  merchantFilter?: string | null;
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
  type Cell = { rev: Revenue; stops: number; packages: number };
  const cells = new Map<string, Map<string, Cell>>(); // route -> merchant -> cell
  const cell = (routeId: string, m: string) => {
    let rm = cells.get(routeId);
    if (!rm) cells.set(routeId, (rm = new Map()));
    let c = rm.get(m);
    if (!c) rm.set(m, (c = { rev: zeroRev(), stops: 0, packages: 0 }));
    return c;
  };
  for (const s of served) {
    const p = i.merchants[s.merchant_id];
    const c = cell(s.route_id, s.merchant_id);
    c.stops += 1;
    c.rev.stops += p?.stopppreis ?? 0;
    if (s.billPackages) {
      c.packages += s.pakete;
      c.rev.packages += (p?.paketpreis ?? 0) * s.pakete;
    }
  }
  for (const r of i.routes) {
    const m = r.exclusive_merchant_user_id;
    if (!m) continue;
    cell(r.id, m).rev.hours += (i.merchants[m]?.stundenpreis ?? 0) * r.hours;
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
  const driverOk = (r: RouteIn) => !i.driverFilter || r.driver_id === i.driverFilter;
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
    const routeStops = [...rm.values()].reduce((a, c) => a + c.stops, 0);
    const dId = r.driver_id ?? "none";
    const dRow = driverRows.get(dId) ?? newRow(dId, "");
    driverRows.set(dId, dRow);

    // share of this route's cost attributable to the merchant filter
    let share = 1;
    if (i.merchantFilter) {
      if (r.exclusive_merchant_user_id) share = r.exclusive_merchant_user_id === i.merchantFilter ? 1 : 0;
      else share = routeStops > 0 ? (rm.get(i.merchantFilter)?.stops ?? 0) / routeStops : 0;
      if (share === 0 && !rm.has(i.merchantFilter)) continue;
    }
    dRow.routes += 1;
    dRow.hours += r.hours * share;
    dRow.km += r.km * share;
    addCost(dRow.costs, cost, share);
    addCost(totalCost, cost, share);

    for (const [m, c] of rm) {
      if (i.merchantFilter && m !== i.merchantFilter) continue;
      addRev(dRow.revenue, c.rev);
      addRev(totalRev, c.rev);
      dRow.stops += c.stops;
      dRow.packages += c.packages;
      const mRow = merchantRows.get(m) ?? newRow(m, i.merchants[m]?.name ?? "Unbekannt");
      merchantRows.set(m, mRow);
      addRev(mRow.revenue, c.rev);
      mRow.stops += c.stops;
      mRow.packages += c.packages;
      const mShare = r.exclusive_merchant_user_id ? (r.exclusive_merchant_user_id === m ? 1 : 0) : routeStops > 0 ? c.stops / routeStops : 0;
      addCost(mRow.costs, cost, mShare);
      mRow.hours += r.hours * mShare;
      mRow.km += r.km * mShare;
      if (mShare > 0) mRow.routes += 1;
    }
  }

  // Grundbeitrag: a merchant-level monthly fee, not attributable to a driver.
  if (!i.driverFilter) {
    for (const [m, p] of Object.entries(i.merchants)) {
      if (i.merchantFilter && m !== i.merchantFilter) continue;
      const base = ((p.grundbeitrag_monat ?? 0) * 12 * i.days) / 365;
      if (base <= 0) continue;
      const mRow = merchantRows.get(m) ?? newRow(m, p.name);
      merchantRows.set(m, mRow);
      mRow.revenue.base += base;
      totalRev.base += base;
    }
    // Fixed costs of vehicles that drove no route in the period still count for the fleet.
    if (!i.merchantFilter) {
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
