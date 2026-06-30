import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Package, CheckCircle2, XCircle, Clock, Target, Route as RouteIcon, Timer, CalendarClock } from "lucide-react";

interface Props {
  driverId: string | null;
  driverName?: string;
  onClose: () => void;
}

interface Stats {
  totalStops: number;
  delivered: number;
  skipped: number;
  open: number;
  deliveryRate: number; // 0..1
  routes: number;
  withEta: number;
  onTime: number; // |delivered - eta| <= 30 min
  early: number;
  late: number;
  avgDeviationMin: number; // signed average
  avgAbsDeviationMin: number;
  last30Delivered: number;
}

interface WorkDay {
  day: string;
  total_seconds: number;
  session_count: number;
  first_start: string;
  last_end: string;
}

interface WorkStats {
  days: WorkDay[];
  totalSec30: number;
  totalSec90: number;
  activeDays30: number;
}

const ON_TIME_WINDOW_MIN = 30;

export const DriverStatsDialog = ({ driverId, driverName, onClose }: Props) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [work, setWork] = useState<WorkStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    setLoading(true);
    setStats(null);
    setWork(null);
    (async () => {
      const { data: routes } = await supabase
        .from("routes")
        .select("id")
        .eq("driver_id", driverId);
      const routeIds = (routes ?? []).map((r: any) => r.id);
      if (routeIds.length === 0) {
        setStats({
          totalStops: 0, delivered: 0, skipped: 0, open: 0, deliveryRate: 0, routes: 0,
          withEta: 0, onTime: 0, early: 0, late: 0, avgDeviationMin: 0, avgAbsDeviationMin: 0,
          last30Delivered: 0,
        });
        setLoading(false);
        return;
      }
      const { data: stops } = await supabase
        .from("route_stops")
        .select("status, eta, delivered_at")
        .in("route_id", routeIds);

      const list = stops ?? [];
      const delivered = list.filter((s: any) => s.status === "erledigt").length;
      const skipped = list.filter((s: any) => s.status === "uebersprungen").length;
      const open = list.length - delivered - skipped;
      const finalized = delivered + skipped;
      const deliveryRate = finalized > 0 ? delivered / finalized : 0;

      let withEta = 0, onTime = 0, early = 0, late = 0;
      let sumDev = 0, sumAbs = 0;
      const now = Date.now();
      const cutoff30 = now - 30 * 24 * 60 * 60 * 1000;
      let last30 = 0;
      for (const s of list as any[]) {
        if (s.status === "erledigt" && s.delivered_at) {
          if (new Date(s.delivered_at).getTime() >= cutoff30) last30++;
        }
        if (s.status === "erledigt" && s.eta && s.delivered_at) {
          const dev = (new Date(s.delivered_at).getTime() - new Date(s.eta).getTime()) / 60000;
          withEta++;
          sumDev += dev;
          sumAbs += Math.abs(dev);
          if (Math.abs(dev) <= ON_TIME_WINDOW_MIN) onTime++;
          else if (dev < 0) early++;
          else late++;
        }
      }

      setStats({
        totalStops: list.length,
        delivered, skipped, open, deliveryRate,
        routes: routeIds.length,
        withEta, onTime, early, late,
        avgDeviationMin: withEta > 0 ? sumDev / withEta : 0,
        avgAbsDeviationMin: withEta > 0 ? sumAbs / withEta : 0,
        last30Delivered: last30,
      });

      const { data: timeRows } = await supabase.rpc("admin_driver_time_stats", { _driver_id: driverId });
      const days: WorkDay[] = ((timeRows ?? []) as any[]).map((r) => ({
        day: r.day,
        total_seconds: Number(r.total_seconds ?? 0),
        session_count: Number(r.session_count ?? 0),
        first_start: r.first_start,
        last_end: r.last_end,
      }));
      const cutoff30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let s30 = 0, s90 = 0, active30 = 0;
      for (const d of days) {
        s90 += d.total_seconds;
        if (new Date(d.day).getTime() >= cutoff30d) {
          s30 += d.total_seconds;
          if (d.total_seconds > 0) active30++;
        }
      }
      setWork({ days, totalSec30: s30, totalSec90: s90, activeDays30: active30 });

      setLoading(false);
    })();
  }, [driverId]);

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtMin = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} min`;
  const fmtHM = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  };
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const fmtDay = (d: string) =>
    new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });

  return (
    <Dialog open={!!driverId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Statistiken – {driverName ?? "Fahrer"}</DialogTitle>
        </DialogHeader>
        {loading || !stats ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={<Target className="h-4 w-4" />} label="Zustellquote" value={pct(stats.deliveryRate)} accent />
              <Kpi icon={<RouteIcon className="h-4 w-4" />} label="Routen" value={String(stats.routes)} />
              <Kpi icon={<Package className="h-4 w-4" />} label="Stopps gesamt" value={String(stats.totalStops)} />
              <Kpi icon={<CheckCircle2 className="h-4 w-4 text-primary" />} label="Letzte 30 Tage" value={String(stats.last30Delivered)} sub="zugestellt" />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Zustellungen</h3>
              <div className="grid grid-cols-3 gap-3">
                <Kpi icon={<CheckCircle2 className="h-4 w-4 text-primary" />} label="Zugestellt" value={String(stats.delivered)} />
                <Kpi icon={<XCircle className="h-4 w-4 text-destructive" />} label="Nicht zugestellt" value={String(stats.skipped)} />
                <Kpi icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Offen" value={String(stats.open)} />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Timing (Zustellzeit vs. geplante ETA)
              </h3>
              {stats.withEta === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Daten für Timing-Auswertung vorhanden.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Kpi
                      icon={<Target className="h-4 w-4 text-primary" />}
                      label={`Im Fenster ±${ON_TIME_WINDOW_MIN} min`}
                      value={pct(stats.onTime / stats.withEta)}
                      sub={`${stats.onTime} / ${stats.withEta}`}
                      accent
                    />
                    <Kpi
                      icon={<Timer className="h-4 w-4" />}
                      label="Ø Abweichung"
                      value={fmtMin(stats.avgDeviationMin)}
                      sub={`Ø |Δ| ${stats.avgAbsDeviationMin.toFixed(1)} min`}
                    />
                    <Kpi icon={<Clock className="h-4 w-4 text-emerald-600" />} label="Zu früh" value={String(stats.early)} sub={pct(stats.early / stats.withEta)} />
                    <Kpi icon={<Clock className="h-4 w-4 text-amber-600" />} label="Zu spät" value={String(stats.late)} sub={pct(stats.late / stats.withEta)} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Berechnet aus zugestellten Stopps mit geplanter ETA. Toleranz: ±{ON_TIME_WINDOW_MIN} Minuten.
                  </p>
                </>
              )}
            </div>

            {work && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" /> Arbeitszeit
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                  <Kpi icon={<Timer className="h-4 w-4 text-primary" />} label="Letzte 30 Tage" value={fmtHM(work.totalSec30)} sub={`${work.activeDays30} aktive Tage`} accent />
                  <Kpi icon={<Timer className="h-4 w-4" />} label="Letzte 90 Tage" value={fmtHM(work.totalSec90)} />
                  <Kpi icon={<Clock className="h-4 w-4" />} label="Ø pro aktivem Tag" value={work.activeDays30 > 0 ? fmtHM(Math.round(work.totalSec30 / work.activeDays30)) : "–"} sub="der letzten 30 Tage" />
                </div>
                {work.days.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch keine Arbeitszeit erfasst.</p>
                ) : (
                  <div className="rounded-lg border divide-y max-h-72 overflow-y-auto">
                    {work.days.slice(0, 30).map((d) => (
                      <div key={d.day} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="font-medium">{fmtDay(d.day)}</div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span className="tabular-nums">{fmtTime(d.first_start)} – {fmtTime(d.last_end)}</span>
                          {d.session_count > 1 && (
                            <span className="text-[10px] uppercase">{d.session_count} Sessions</span>
                          )}
                          <span className="font-semibold text-foreground tabular-nums min-w-[70px] text-right">{fmtHM(d.total_seconds)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Kpi = ({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean }) => (
  <div className={`rounded-lg border p-3 ${accent ? "bg-primary/5 border-primary/30" : "bg-card"}`}>
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <div className="text-xl font-semibold leading-tight">{value}</div>
    {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);

export default DriverStatsDialog;