import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MerchantPrices } from "@/lib/profitability";
import { routeRevenue, type RouteRevenue, type RouteRevenueStop } from "@/lib/routeRevenue";

export interface RouteRevenueInfo { planned: RouteRevenue; actual: RouteRevenue | null; completed: boolean }

/** Loads planned (and, once completed, actual) revenue per tour. Admin only (needs prices). */
export function useRouteRevenues(routeIds: string[], refreshKey: unknown = 0) {
  const [data, setData] = useState<Record<string, RouteRevenueInfo>>({});
  const key = [...routeIds].sort().join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) { setData({}); return; }
    let cancel = false;
    (async () => {
      const [routesRes, profilesRes, sessRes] = await Promise.all([
        supabase.from("routes")
          .select("id, status, exclusive_merchant_user_id, total_duration_s, route_stops(id, order_id, status, created_at, orders(user_id, pakete))")
          .in("id", ids),
        supabase.from("profiles").select("user_id, parent_user_id, firma_name, paketpreis, stopppreis, stundenpreis, tagespauschale, grundbeitrag_monat"),
        supabase.from("driver_work_sessions").select("route_id, started_at, ended_at, duration_seconds").in("route_id", ids),
      ]);
      if (cancel) return;
      const routes = (routesRes.data ?? []) as any[];
      const profiles = (profilesRes.data ?? []) as any[];
      const owner = new Map(profiles.map((p) => [p.user_id, p.parent_user_id ?? p.user_id]));
      const merchants: Record<string, MerchantPrices> = {};
      for (const p of profiles) if (!p.parent_user_id) merchants[p.user_id] = {
        name: p.firma_name ?? "", paketpreis: p.paketpreis, stopppreis: p.stopppreis,
        stundenpreis: p.stundenpreis, tagespauschale: p.tagespauschale, grundbeitrag_monat: p.grundbeitrag_monat,
      };

      // Packages billed once: only the earliest route stop of an order bills them.
      const orderIds = [...new Set(routes.flatMap((r) => (r.route_stops ?? []).map((s: any) => s.order_id)))];
      const earliest = new Map<string, { id: string; at: string }>();
      for (let i = 0; i < orderIds.length; i += 200) {
        const { data: hist } = await supabase.from("route_stops").select("id, order_id, created_at").in("order_id", orderIds.slice(i, i + 200));
        for (const h of hist ?? []) {
          const cur = earliest.get(h.order_id);
          if (!cur || h.created_at < cur.at) earliest.set(h.order_id, { id: h.id, at: h.created_at });
        }
      }
      if (cancel) return;

      const secBy = new Map<string, number>();
      for (const s of (sessRes.data ?? []) as any[]) {
        const sec = s.duration_seconds ?? (s.ended_at ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000 : 0);
        if (s.route_id) secBy.set(s.route_id, (secBy.get(s.route_id) ?? 0) + Math.max(0, sec));
      }

      const out: Record<string, RouteRevenueInfo> = {};
      for (const r of routes) {
        const stops: RouteRevenueStop[] = (r.route_stops ?? []).filter((s: any) => s.orders).map((s: any) => ({
          merchant_id: owner.get(s.orders.user_id) ?? s.orders.user_id,
          pakete: s.orders.pakete ?? 1,
          served: s.status === "erledigt" || s.status === "uebersprungen",
          billPackages: (earliest.get(s.order_id)?.id ?? s.id) === s.id,
        }));
        const plannedH = (r.total_duration_s ?? 0) / 3600;
        const planned = routeRevenue({ stops, hours: plannedH, exclusiveMerchantId: r.exclusive_merchant_user_id, merchants, mode: "planned" });
        const completed = r.status === "abgeschlossen";
        let actual: RouteRevenue | null = null;
        if (completed) {
          const sec = secBy.get(r.id);
          const h = sec && sec > 0 && sec <= 16 * 3600 ? sec / 3600 : plannedH;
          actual = routeRevenue({ stops, hours: h, exclusiveMerchantId: r.exclusive_merchant_user_id, merchants, mode: "actual" });
        }
        out[r.id] = { planned, actual, completed };
      }
      setData(out);
    })();
    return () => { cancel = true; };
  }, [key, refreshKey]);

  return data;
}
