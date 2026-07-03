import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DriverLayout } from "@/components/driver/DriverLayout";
import { useDriverCheck } from "@/hooks/useDriverCheck";
import { Calendar, Package, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PushToggle } from "@/components/PushToggle";

interface RouteRow {
  id: string;
  name: string;
  datum: string;
  start_time: string;
  status: string;
  total_stops: number;
  done_stops: number;
  skipped_stops: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const DriverHomePage = () => {
  const { driverId } = useDriverCheck();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name, datum, start_time, status, route_stops(id, status)")
        .eq("driver_id", driverId)
        .gte("datum", todayISO())
        .order("datum", { ascending: true })
        .order("start_time", { ascending: true });

      const rows: RouteRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        datum: r.datum,
        start_time: r.start_time,
        status: r.status,
        total_stops: r.route_stops?.length ?? 0,
        done_stops: r.route_stops?.filter((s: any) => s.status === "erledigt").length ?? 0,
        skipped_stops: r.route_stops?.filter((s: any) => s.status === "uebersprungen").length ?? 0,
      }));
      const order = { aktiv: 0, geplant: 1, abgeschlossen: 2 } as Record<string, number>;
      rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
      if (!cancelled) {
        setRoutes(rows);
        setLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel(`driver-home-${driverId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "route_stops" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "routes", filter: `driver_id=eq.${driverId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [driverId]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const isToday = (d: string) => d === todayISO();
  const statusLabel = (s: string) =>
    s === "aktiv" ? "Aktiv" : s === "abgeschlossen" ? "Abgeschlossen" : "Geplant";
  const statusVariant = (s: string): "default" | "secondary" | "outline" =>
    s === "aktiv" ? "default" : s === "abgeschlossen" ? "secondary" : "outline";

  return (
    <DriverLayout title="Meine Routen">
      <div className="p-4 space-y-3">
        <div className="flex justify-end">
          <PushToggle compact />
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : routes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Keine Routen geplant</p>
          </div>
        ) : (
          routes.map((r) => {
            const donePct = r.total_stops > 0 ? (r.done_stops / r.total_stops) * 100 : 0;
            const skipPct = r.total_stops > 0 ? (r.skipped_stops / r.total_stops) * 100 : 0;
            return (
              <Link
                key={r.id}
                to={`/fahrer/route/${r.id}`}
                className="block bg-card border rounded-xl p-4 active:scale-[0.98] transition-transform shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Calendar className="h-3 w-3" />
                      <span className={isToday(r.datum) ? "text-primary font-medium" : ""}>
                        {isToday(r.datum) ? "Heute" : fmtDate(r.datum)}
                      </span>
                      <span>•</span>
                      <span>{r.start_time?.slice(0, 5)} Uhr</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold truncate">{r.name}</h2>
                      <Badge variant={statusVariant(r.status)} className="text-[10px] py-0 h-5">
                        {statusLabel(r.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {r.done_stops} / {r.total_stops} Stopps erledigt
                      {r.skipped_stops > 0 && (
                        <span className="text-orange-500 font-medium"> · {r.skipped_stops} nicht zugestellt</span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
                <div className="mt-3 h-1.5 w-full rounded-full bg-secondary overflow-hidden flex">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${donePct}%` }}
                  />
                  <div
                    className="h-full bg-orange-500 transition-all"
                    style={{ width: `${skipPct}%` }}
                  />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </DriverLayout>
  );
};

export default DriverHomePage;