import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { vehicleCosts } from "@/lib/vehicleCosts";

type Period = "this_month" | "last_month" | "last_30" | "this_year" | "last_year";
const periodLabels: Record<Period, string> = {
  this_month: "Aktueller Monat",
  last_month: "Letzter Monat",
  last_30: "Letzte 30 Tage",
  this_year: "Aktuelles Jahr",
  last_year: "Letztes Jahr",
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function range(p: Period): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (p) {
    case "this_month": return { from: new Date(y, m, 1), to: now };
    case "last_month": return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
    case "last_30": return { from: new Date(now.getTime() - 29 * 864e5), to: now };
    case "this_year": return { from: new Date(y, 0, 1), to: now };
    case "last_year": return { from: new Date(y - 1, 0, 1), to: new Date(y - 1, 11, 31) };
  }
}

const eur = (n: number | null) => (n == null ? "–" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR" }));
const num = (n: number, d = 1) => n.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });

export function VehicleCostTab({ vehicleId, fixPerMonth, costPerKm }: { vehicleId: string; fixPerMonth: number; costPerKm: number }) {
  const [period, setPeriod] = useState<Period>("this_month");
  const [data, setData] = useState<{ hours: number; km: number; maintenance: number; routes: number; stops: number } | null>(null);
  const { from, to } = useMemo(() => range(period), [period]);

  useEffect(() => {
    let cancel = false;
    setData(null);
    (async () => {
      const { data: routes } = await supabase
        .from("routes")
        .select("id, total_distance_m, total_duration_s, route_stops(status)")
        .eq("vehicle_id", vehicleId)
        .gte("datum", iso(from))
        .lte("datum", iso(to));
      const ids = (routes ?? []).map((r) => r.id);
      const { data: sessions } = ids.length
        ? await supabase.from("driver_work_sessions").select("route_id, started_at, ended_at, duration_seconds").in("route_id", ids)
        : { data: [] as any[] };
      const secByRoute = new Map<string, number>();
      for (const s of sessions ?? []) {
        const sec = s.duration_seconds ?? (s.ended_at ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000 : 0);
        if (s.route_id) secByRoute.set(s.route_id, (secByRoute.get(s.route_id) ?? 0) + Math.max(0, sec));
      }
      let seconds = 0, meters = 0, stops = 0, worked = 0;
      for (const r of routes ?? []) {
        const actual = secByRoute.get(r.id);
        if (actual) { seconds += actual; worked++; }
        else if (r.total_duration_s && (r.route_stops as any[])?.some((s) => s.status === "erledigt")) seconds += r.total_duration_s;
        meters += r.total_distance_m ?? 0;
        stops += ((r.route_stops as any[]) ?? []).filter((s) => s.status === "erledigt").length;
      }
      const { data: maint } = await supabase
        .from("maintenance_schedule")
        .select("kosten")
        .eq("vehicle_id", vehicleId)
        .eq("status", "erledigt")
        .gte("erledigt_am", iso(from))
        .lte("erledigt_am", iso(to));
      const maintenance = (maint ?? []).reduce((a, m) => a + Number(m.kosten ?? 0), 0);
      if (!cancel) setData({ hours: seconds / 3600, km: meters / 1000, maintenance, routes: (routes ?? []).length, stops });
      void worked;
    })();
    return () => { cancel = true; };
  }, [vehicleId, from, to]);

  const days = Math.round((to.getTime() - from.getTime()) / 864e5) + 1;
  const c = data ? vehicleCosts({ fixPerMonth, costPerKm, days, hours: data.hours, km: data.km, maintenance: data.maintenance }) : null;

  const Kpi = ({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) => (
    <Card className={strong ? "border-primary" : undefined}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={strong ? "text-2xl font-bold text-primary" : "text-xl font-semibold"}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {from.toLocaleDateString("de-DE")} – {to.toLocaleDateString("de-DE")} · {days} Tage
        </p>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(periodLabels) as Period[]).map((p) => <SelectItem key={p} value={p}>{periodLabels[p]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {fixPerMonth === 0 && costPerKm === 0 && (
        <p className="text-sm rounded-md border border-warning/50 bg-warning/10 p-3">
          Für dieses Fahrzeug sind noch keine Fixkosten oder Kilometerkosten hinterlegt. Trag sie unter „Fahrzeug bearbeiten" ein.
        </p>
      )}
      {!data || !c ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi strong label="Kosten pro Einsatzstunde" value={eur(c.perHour)} hint={c.perHour == null ? "keine Einsatzstunden" : undefined} />
            <Kpi strong label="Kosten pro Kilometer" value={eur(c.perKm)} />
            <Kpi label="Einsatzstunden" value={`${num(data.hours)} h`} hint={`${data.routes} Touren · ${data.stops} Stopps`} />
            <Kpi label="Gefahrene Kilometer" value={`${num(data.km, 0)} km`} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Fixkosten (anteilig)" value={eur(c.fixed)} hint={`${eur(fixPerMonth)} / Monat`} />
            <Kpi label="Variable Kosten" value={eur(c.variable)} hint={`${eur(costPerKm)} / km`} />
            <Kpi label="Wartung & Reparatur" value={eur(c.maintenance)} hint="erledigte Wartungen" />
            <Kpi label="Gesamtkosten" value={eur(c.total)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Stunden aus der echten Arbeitszeit der Fahrer (Tourstart bis letzter Stopp); fehlt diese, wird die geplante Tourdauer genommen. Kilometer aus der optimierten Tour.
          </p>
        </>
      )}
    </div>
  );
}
