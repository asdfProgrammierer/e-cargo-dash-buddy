import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle } from "lucide-react";
import { sumCostItems, type VehicleCostItem } from "@/lib/vehicleCosts";
import { analyzeProfit, EMPLOYER_SURCHARGE, type ProfitInput, type ProfitResult, type MerchantPrices, type StopIn, type RouteIn, type VehicleIn } from "@/lib/profitability";
import { cn } from "@/lib/utils";

type Period = "this_month" | "last_month" | "last_30" | "this_year" | "custom";
const periodLabels: Record<Period, string> = {
  this_month: "Aktueller Monat",
  last_month: "Letzter Monat",
  last_30: "Letzte 30 Tage",
  this_year: "Aktuelles Jahr",
  custom: "Eigener Zeitraum",
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function range(p: Period, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (p) {
    case "this_month": return { from: iso(new Date(y, m, 1)), to: iso(now) };
    case "last_month": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "last_30": return { from: iso(new Date(now.getTime() - 29 * 864e5)), to: iso(now) };
    case "this_year": return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    case "custom": return custom;
  }
}
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const num = (n: number, d = 1) => n.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });

async function chunked<T>(ids: string[], fn: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...(await fn(ids.slice(i, i + 200))));
  return out;
}

type Base = Omit<ProfitInput, "driverFilter" | "merchantFilter">;

export function CostRevenueTab() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [custom, setCustom] = useState(() => range("this_month", { from: "", to: "" }));
  const [driver, setDriver] = useState("all");
  const [merchant, setMerchant] = useState("all");
  const [base, setBase] = useState<Base | null>(null);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { from, to } = useMemo(() => range(period, custom), [period, custom]);

  useEffect(() => {
    if (!from || !to || from > to) return;
    let cancel = false;
    setLoading(true);
    (async () => {
      const [routesRes, profilesRes, driversRes, vehiclesRes, itemsRes, maintRes] = await Promise.all([
        supabase.from("routes")
          .select("id, datum, driver_id, vehicle_id, exclusive_merchant_user_id, total_distance_m, total_duration_s, route_stops(id, order_id, status)")
          .gte("datum", from).lte("datum", to),
        supabase.from("profiles").select("user_id, parent_user_id, firma_name, ansprechpartner, paketpreis, stopppreis, stundenpreis, tagespauschale, grundbeitrag_monat"),
        supabase.from("drivers").select("id, name, hourly_wage"),
        supabase.from("vehicles").select("id"),
        supabase.from("vehicle_cost_items").select("vehicle_id, intervall, betrag"),
        supabase.from("maintenance_schedule").select("vehicle_id, kosten").eq("status", "erledigt").gte("erledigt_am", from).lte("erledigt_am", to),
      ]);
      const routes = routesRes.data ?? [];
      const routeIds = routes.map((r) => r.id);
      const sessions = await chunked(routeIds, async (p) =>
        (await supabase.from("driver_work_sessions").select("route_id, started_at, ended_at, duration_seconds").in("route_id", p)).data ?? []);
      const secByRoute = new Map<string, number>();
      for (const s of sessions) {
        const sec = s.duration_seconds ?? (s.ended_at ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000 : 0);
        if (s.route_id) secByRoute.set(s.route_id, (secByRoute.get(s.route_id) ?? 0) + Math.max(0, sec));
      }

      const allStops = routes.flatMap((r) => ((r.route_stops as any[]) ?? []).map((s) => ({ ...s, route_id: r.id, datum: r.datum })));
      const orderIds = [...new Set(allStops.map((s) => s.order_id as string))];
      const orders = await chunked(orderIds, async (p) =>
        (await supabase.from("orders").select("id, user_id, pakete").in("id", p)).data ?? []);
      const orderMap = new Map(orders.map((o) => [o.id, o]));
      // Earliest stop of each order across all time → only that one bills packages.
      const history = await chunked(orderIds, async (p) =>
        (await supabase.from("route_stops").select("id, order_id, created_at, routes(datum)").in("order_id", p)).data ?? []);
      const firstStop = new Map<string, { id: string; key: string }>();
      for (const h of history as any[]) {
        const key = `${h.routes?.datum ?? "9999"}|${h.created_at}`;
        const cur = firstStop.get(h.order_id);
        if (!cur || key < cur.key) firstStop.set(h.order_id, { id: h.id, key });
      }

      const profiles = profilesRes.data ?? [];
      const owner = new Map(profiles.map((p) => [p.user_id, p.parent_user_id ?? p.user_id]));
      const merchants: Record<string, MerchantPrices> = {};
      for (const p of profiles) {
        if (p.parent_user_id) continue;
        merchants[p.user_id] = {
          name: p.firma_name || p.ansprechpartner || "Händler",
          paketpreis: p.paketpreis, stopppreis: p.stopppreis, stundenpreis: p.stundenpreis,
          tagespauschale: p.tagespauschale, grundbeitrag_monat: p.grundbeitrag_monat,
        };
      }

      const stops: StopIn[] = [];
      for (const s of allStops) {
        const o = orderMap.get(s.order_id);
        if (!o) continue;
        stops.push({
          route_id: s.route_id,
          order_id: s.order_id,
          merchant_id: owner.get(o.user_id) ?? o.user_id,
          pakete: o.pakete ?? 1,
          served: s.status === "erledigt" || s.status === "uebersprungen",
          billPackages: firstStop.get(s.order_id)?.id === s.id,
        });
      }
      const routeIns: RouteIn[] = routes.map((r) => {
        const served = ((r.route_stops as any[]) ?? []).some((s) => s.status !== "offen");
        const actual = secByRoute.get(r.id);
        // Sessions longer than 16 h are stale (never closed properly) → use the planned tour duration instead.
        const planned = served ? r.total_duration_s ?? 0 : 0;
        const sec = actual != null && actual > 0 && actual <= 16 * 3600 ? actual : planned;
        return {
          id: r.id, datum: r.datum, driver_id: r.driver_id, vehicle_id: r.vehicle_id,
          exclusive_merchant_user_id: r.exclusive_merchant_user_id,
          hours: sec / 3600, km: served ? (r.total_distance_m ?? 0) / 1000 : 0,
        };
      });

      const itemsBy = new Map<string, VehicleCostItem[]>();
      for (const it of itemsRes.data ?? []) {
        const arr = itemsBy.get(it.vehicle_id) ?? [];
        arr.push({ intervall: it.intervall as VehicleCostItem["intervall"], betrag: Number(it.betrag) });
        itemsBy.set(it.vehicle_id, arr);
      }
      const maint = new Map<string, number>();
      for (const m of maintRes.data ?? []) maint.set(m.vehicle_id, (maint.get(m.vehicle_id) ?? 0) + Number(m.kosten ?? 0));
      const vehicles: Record<string, VehicleIn> = {};
      for (const v of vehiclesRes.data ?? []) {
        const s = sumCostItems(itemsBy.get(v.id) ?? []);
        vehicles[v.id] = { fixPerMonth: s.fixPerMonth, costPerKm: s.costPerKm, maintenance: maint.get(v.id) ?? 0 };
      }
      const wages: Record<string, number | null> = {};
      const names: Record<string, string> = {};
      for (const d of driversRes.data ?? []) { wages[d.id] = d.hourly_wage; names[d.id] = d.name; }

      const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 864e5) + 1;
      if (!cancel) {
        setBase({ days, routes: routeIns, stops, merchants, wages, vehicles });
        setDriverNames(names);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [from, to]);

  const result: ProfitResult | null = useMemo(
    () => base ? analyzeProfit({ ...base, driverFilter: driver === "all" ? null : driver, merchantFilter: merchant === "all" ? null : merchant }) : null,
    [base, driver, merchant],
  );
  const merchantOpts = useMemo(() => Object.entries(base?.merchants ?? {}).map(([id, m]) => ({ id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name)), [base]);
  const driverOpts = useMemo(() => Object.entries(driverNames).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [driverNames]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Zeitraum</p>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(periodLabels) as Period[]).map((p) => <SelectItem key={p} value={p}>{periodLabels[p]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1"><p className="text-xs text-muted-foreground">Von</p><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
              <div className="space-y-1"><p className="text-xs text-muted-foreground">Bis</p><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
            </>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Fahrer</p>
            <Select value={driver} onValueChange={setDriver}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Fahrer</SelectItem>
                {driverOpts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Händler</p>
            <Select value={merchant} onValueChange={setMerchant}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Händler</SelectItem>
                {merchantOpts.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mb-2" />}
        </CardContent>
      </Card>

      {result && (
        <>
          {result.missingWages.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <span>Kein Stundenlohn hinterlegt für: {result.missingWages.map((id) => driverNames[id] ?? id).join(", ")} — Lohnkosten fehlen in der Rechnung.</span>
            </div>
          )}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Einnahmen" value={eur(result.revenue.total)} />
            <Kpi label="Kosten" value={eur(result.costs.total)} />
            <Kpi label="Deckungsbeitrag" value={eur(result.margin)} tone={result.margin < 0 ? "bad" : "good"} />
            <Kpi label="Marge" value={result.marginPct == null ? "–" : `${num(result.marginPct)} %`} tone={(result.marginPct ?? 0) < 0 ? "bad" : "good"} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Einnahmen</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Line l="Paketpreise (1× pro Auftrag)" v={result.revenue.packages} />
                <Line l="Stopppreise (jeder Stopp)" v={result.revenue.stops} />
                <Line l="Stundenpreise (exklusive Touren)" v={result.revenue.hours} />
                <Line l="Tagespauschalen" v={result.revenue.daily} />
                <Line l="Grundbeiträge (anteilig)" v={result.revenue.base} hint={driver !== "all" ? "nicht einem Fahrer zuordenbar" : undefined} />
                <Line l="Summe" v={result.revenue.total} bold />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Kosten</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Line l="Fahrerlohn brutto" v={result.costs.wage} />
                <Line l={`Arbeitgeber-Aufschlag (+${EMPLOYER_SURCHARGE * 100} %)`} v={result.costs.surcharge} />
                <Line l="Lohnkosten gesamt" v={result.costs.wage + result.costs.surcharge} muted />
                <Line l="Fahrzeugkosten (Fix, km, Wartung)" v={result.costs.vehicle} />
                <Line l="Summe" v={result.costs.total} bold />
              </CardContent>
            </Card>
          </div>

          <RowTable title="Umsatz nach Fahrer" description="Was jeder Fahrer auf seinen Touren erwirtschaftet hat — abzüglich Lohn (inkl. 30 %) und Fahrzeuganteil."
            rows={result.byDriver.map((r) => ({ ...r, name: r.id === "none" ? "Ohne Fahrer" : driverNames[r.id] ?? "Unbekannt" }))} firstCol="Fahrer" showRoutes />
          <RowTable title="Umsatz nach Händler" description="Kosten werden nach Stopp-Anteil auf den Touren verteilt; exklusive Touren zählen voll."
            rows={result.byMerchant} firstCol="Händler" showDays />
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold mt-1", tone === "bad" && "text-destructive", tone === "good" && "text-primary")}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Line({ l, v, bold, muted, hint }: { l: string; v: number; bold?: boolean; muted?: boolean; hint?: string }) {
  return (
    <div className={cn("flex justify-between gap-2", bold && "font-semibold border-t pt-1.5", muted && "text-muted-foreground")}>
      <span>{l}{hint && <span className="text-xs text-muted-foreground"> ({hint})</span>}</span>
      <span className="tabular-nums">{eur(v)}</span>
    </div>
  );
}

function RowTable({ title, description, rows, firstCol, showRoutes, showDays }: {
  title: string; description: string; firstCol: string; showRoutes?: boolean; showDays?: boolean;
  rows: ProfitResult["byDriver"];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Keine Daten im Zeitraum.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{firstCol}</TableHead>
                {showRoutes && <TableHead className="text-right">Touren</TableHead>}
                <TableHead className="text-right">Stunden</TableHead>
                <TableHead className="text-right">km</TableHead>
                <TableHead className="text-right">Stopps</TableHead>
                <TableHead className="text-right">Pakete</TableHead>
                {showDays && <TableHead className="text-right">Tage</TableHead>}
                <TableHead className="text-right">Umsatz</TableHead>
                <TableHead className="text-right">Lohn + 30 %</TableHead>
                <TableHead className="text-right">Fahrzeug</TableHead>
                <TableHead className="text-right">Deckungsbeitrag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  {showRoutes && <TableCell className="text-right tabular-nums">{r.routes}</TableCell>}
                  <TableCell className="text-right tabular-nums">{num(r.hours)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.km, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.stops}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.packages}</TableCell>
                  {showDays && <TableCell className="text-right tabular-nums">{r.days}</TableCell>}
                  <TableCell className="text-right tabular-nums">{eur(r.revenue.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(r.costs.wage + r.costs.surcharge)}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(r.costs.vehicle)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", r.margin < 0 ? "text-destructive" : "text-primary")}>{eur(r.margin)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
