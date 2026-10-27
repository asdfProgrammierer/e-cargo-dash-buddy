import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import type { MerchantPrices } from "@/lib/profitability";
import { routeProfit, type RouteProfitResult, type RouteProfitStop } from "@/lib/routeProfit";
import { sumCostItems, type VehicleCostItem } from "@/lib/vehicleCosts";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export interface StopMarginInfo { margin: number; revenue: number; cost: number }

/** Admin-only revenue / cost / margin of one tour, shown below the map in the route detail view. */
export function RouteProfitPanel({ routeId, refreshKey, onStopMargins }: {
  routeId: string; refreshKey?: unknown; onStopMargins?: (m: Record<string, StopMarginInfo>) => void;
}) {
  const [res, setRes] = useState<RouteProfitResult | null>(null);
  const [actual, setActual] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: r } = await supabase.from("routes")
        .select("id, status, driver_id, vehicle_id, exclusive_merchant_user_id, total_distance_m, total_duration_s, stop_duration_minutes, route_stops(id, order_id, status, created_at, detour_duration_s, orders(user_id, pakete))")
        .eq("id", routeId).single();
      if (!r || cancel) return;
      const route = r as any;
      const orderIds = (route.route_stops ?? []).map((s: any) => s.order_id);
      const [profRes, drvRes, itemsRes, sessRes, histRes] = await Promise.all([
        supabase.from("profiles").select("user_id, parent_user_id, firma_name, paketpreis, stopppreis, stundenpreis, tagespauschale, grundbeitrag_monat"),
        route.driver_id ? supabase.from("drivers").select("hourly_wage").eq("id", route.driver_id).maybeSingle() : Promise.resolve({ data: null }),
        route.vehicle_id ? supabase.from("vehicle_cost_items").select("intervall, betrag").eq("vehicle_id", route.vehicle_id) : Promise.resolve({ data: [] }),
        supabase.from("driver_work_sessions").select("started_at, ended_at, duration_seconds").eq("route_id", routeId),
        orderIds.length ? supabase.from("route_stops").select("id, order_id, created_at").in("order_id", orderIds) : Promise.resolve({ data: [] }),
      ]);
      if (cancel) return;
      const profiles = (profRes.data ?? []) as any[];
      const owner = new Map(profiles.map((p) => [p.user_id, p.parent_user_id ?? p.user_id]));
      const merchants: Record<string, MerchantPrices> = {};
      for (const p of profiles) if (!p.parent_user_id) merchants[p.user_id] = {
        name: p.firma_name ?? "", paketpreis: p.paketpreis, stopppreis: p.stopppreis,
        stundenpreis: p.stundenpreis, tagespauschale: p.tagespauschale, grundbeitrag_monat: p.grundbeitrag_monat,
      };
      const earliest = new Map<string, { id: string; at: string }>();
      for (const h of (histRes.data ?? []) as any[]) {
        const cur = earliest.get(h.order_id);
        if (!cur || h.created_at < cur.at) earliest.set(h.order_id, { id: h.id, at: h.created_at });
      }
      const defStop = (route.stop_duration_minutes ?? 3) * 60;
      const stops: RouteProfitStop[] = (route.route_stops ?? []).filter((s: any) => s.orders).map((s: any) => ({
        id: s.id,
        merchant_id: owner.get(s.orders.user_id) ?? s.orders.user_id,
        pakete: s.orders.pakete ?? 1,
        served: s.status === "erledigt" || s.status === "uebersprungen",
        billPackages: (earliest.get(s.order_id)?.id ?? s.id) === s.id,
        detourSec: s.detour_duration_s,
        stopSec: defStop,
      }));
      const plannedH = (route.total_duration_s ?? 0) / 3600;
      const completed = route.status === "abgeschlossen";
      let sec = 0;
      for (const s of (sessRes.data ?? []) as any[]) sec += Math.max(0, s.duration_seconds ?? (s.ended_at ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000 : 0));
      const hours = completed && sec > 0 && sec <= 16 * 3600 ? sec / 3600 : plannedH;
      const wage = (drvRes.data as any)?.hourly_wage ?? null;
      const vehicle = route.vehicle_id ? sumCostItems(((itemsRes.data ?? []) as any[]).map((x) => ({ intervall: x.intervall as VehicleCostItem["intervall"], betrag: Number(x.betrag) }))) : null;
      const out = routeProfit({
        stops, hours, km: (route.total_distance_m ?? 0) / 1000, wage, vehicle,
        exclusiveMerchantId: route.exclusive_merchant_user_id, merchants, mode: completed ? "actual" : "planned",
      });
      const miss: string[] = [];
      if (!route.driver_id) miss.push("kein Fahrer zugeordnet");
      else if (!wage) miss.push("Stundenlohn des Fahrers fehlt");
      if (!route.vehicle_id) miss.push("kein Fahrzeug zugeordnet");
      if (!route.total_duration_s) miss.push("Tour noch nicht optimiert");
      setMissing(miss); setActual(completed); setRes(out);
      onStopMargins?.(out.byStop);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, refreshKey]);

  if (!res) return null;
  const positive = res.margin >= 0;
  const lossStops = Object.values(res.byStop).filter((s) => s.margin < 0).length;

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Wirtschaftlichkeit der Tour</CardTitle>
        <Badge variant="outline">{actual ? "Tatsächlich" : "Voraussichtlich"}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-caption text-muted-foreground">Umsatz</div>
            <div className="text-xl font-semibold tabular-nums">{eur(res.revenue.total)}</div>
            <div className="text-caption text-muted-foreground tabular-nums">
              Pakete {eur(res.revenue.packages)} · Stopps {eur(res.revenue.stops)}<br />
              Stunden {eur(res.revenue.hours)} · Pauschale {eur(res.revenue.daily)}
            </div>
          </div>
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-caption text-muted-foreground">Kosten</div>
            <div className="text-xl font-semibold tabular-nums">{eur(res.costs.total)}</div>
            <div className="text-caption text-muted-foreground tabular-nums">
              Lohn {eur(res.costs.wage)} · AG-Aufschlag 30 % {eur(res.costs.surcharge)}<br />
              Fahrzeug {eur(res.costs.vehicle)}
            </div>
          </div>
          <div className={`rounded-md border p-3 space-y-1 ${positive ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
            <div className="text-caption text-muted-foreground">{positive ? "Gewinn" : "Verlust"}</div>
            <div className={`text-xl font-semibold tabular-nums flex items-center gap-1.5 ${positive ? "text-success" : "text-destructive"}`}>
              {positive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {res.margin > 0 ? "+" : ""}{eur(res.margin)}
            </div>
            <div className="text-caption text-muted-foreground">
              {res.marginPct != null ? `${res.marginPct.toLocaleString("de-DE")} % Marge` : "–"} · {lossStops} Minus-Stopp(s)
            </div>
          </div>
        </div>

        {res.byMerchant.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-caption text-muted-foreground border-b">
                  <th className="text-left font-medium py-1.5">Händler</th>
                  <th className="text-right font-medium">Stopps</th>
                  <th className="text-right font-medium">Umsatz</th>
                  <th className="text-right font-medium">Kosten</th>
                  <th className="text-right font-medium">Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {res.byMerchant.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 last:border-0 tabular-nums">
                    <td className="py-1.5 truncate max-w-[200px]">{m.name}</td>
                    <td className="text-right">{m.stops}</td>
                    <td className="text-right">{eur(m.revenue)}</td>
                    <td className="text-right">{eur(m.cost)}</td>
                    <td className={`text-right font-medium ${m.margin < 0 ? "text-destructive" : "text-success"}`}>{m.margin > 0 ? "+" : ""}{eur(m.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-caption text-muted-foreground space-y-1">
          <p>Kosten pro Stopp werden {res.splitByDetour ? "nach echtem Umweg (Hin- und Weiterfahrt) plus Standzeit" : "gleichmäßig nach Anzahl der Stopps"} verteilt. Stopps in der Liste zeigen das Einzelergebnis: grün Gewinn, rot Verlust, orange kostendeckend.</p>
          {missing.length > 0 && (
            <p className="flex items-center gap-1 text-warning"><AlertTriangle className="h-3.5 w-3.5" />Ungenau: {missing.join(", ")}.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
