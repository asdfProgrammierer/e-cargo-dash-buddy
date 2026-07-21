import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertTriangle, MapPin, BarChart3, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Range = "7" | "30" | "90";

interface OrderRow {
  id: string;
  status: string;
  empfaenger_plz: string;
  created_at: string;
  delivered_at: string | null;
}

const RANGES: { label: string; value: Range; days: number }[] = [
  { label: "7 Tage", value: "7", days: 7 },
  { label: "30 Tage", value: "30", days: 30 },
  { label: "90 Tage", value: "90", days: 90 },
];

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function MerchantAnalytics() {
  const [range, setRange] = useState<Range>("30");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const days = RANGES.find((r) => r.value === range)?.days ?? 30;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceIso = since.toISOString();

      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) {
        if (!cancelled) {
          setOrders([]);
          setHistory([]);
          setLoading(false);
        }
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("parent_user_id")
        .eq("user_id", uid)
        .maybeSingle();
      const ownerId = (prof?.parent_user_id as string | null) ?? uid;

      const [ordersRes, histRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, status, empfaenger_name, created_at, delivered_at")
          .eq("user_id", ownerId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("order_status_history")
          .select("reason, created_at")
          .eq("user_id", ownerId)
          .eq("status", "nicht_zugestellt")
          .gte("created_at", sinceIso)
          .limit(1000),
      ]);

      if (cancelled) return;
      setOrders((ordersRes.data as OrderRow[]) ?? []);
      setHistory((histRes.data as HistoryRow[]) ?? []);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const stats = useMemo(() => {
    const delivered = orders.filter((o) => o.status === "zugestellt");
    const failed = orders.filter((o) => o.status === "nicht_zugestellt");
    const finished = delivered.length + failed.length;
    const deliveryRate = finished > 0 ? (delivered.length / finished) * 100 : null;
    const failureRate = finished > 0 ? (failed.length / finished) * 100 : null;

    // Ø Zustellzeit in Stunden
    const deliveryDurations = delivered
      .filter((o) => o.delivered_at)
      .map(
        (o) =>
          (new Date(o.delivered_at as string).getTime() - new Date(o.created_at).getTime()) /
          (1000 * 60 * 60),
      )
      .filter((h) => h >= 0 && h < 24 * 90);
    const avgDeliveryHours =
      deliveryDurations.length > 0
        ? deliveryDurations.reduce((a, b) => a + b, 0) / deliveryDurations.length
        : null;

    // Top Empfänger
    const recipientCounts = new Map<string, number>();
    orders.forEach((o) => {
      const name = o.empfaenger_name?.trim() || "—";
      recipientCounts.set(name, (recipientCounts.get(name) ?? 0) + 1);
    });
    const topRecipients = Array.from(recipientCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Wochentag-Verteilung
    const weekdayCounts = new Array(7).fill(0) as number[];
    orders.forEach((o) => {
      const d = new Date(o.created_at);
      // 0=So..6=Sa  -> Mo=0..So=6
      const idx = (d.getDay() + 6) % 7;
      weekdayCounts[idx] += 1;
    });
    const weekdayData = WEEKDAYS.map((day, i) => ({ day, sendungen: weekdayCounts[i] }));

    // Top Hindernis-Gründe
    const reasonCounts = new Map<string, number>();
    history.forEach((h) => {
      const r = (h.reason ?? "").trim();
      if (!r) return;
      // Strip "Versuch X/Y: " prefix
      const clean = r.replace(/^Versuch\s+\d+\/\d+:\s*/i, "").trim() || r;
      reasonCounts.set(clean, (reasonCounts.get(clean) ?? 0) + 1);
    });
    const topReasons = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      deliveryRate,
      failureRate,
      avgDeliveryHours,
      topRecipients,
      weekdayData,
      topReasons,
      totalFinished: finished,
    };
  }, [orders, history]);

  const formatDuration = (h: number) => {
    if (h < 1) return `${Math.round(h * 60)} Min`;
    if (h < 48) return `${h.toFixed(1)} h`;
    return `${(h / 24).toFixed(1)} Tage`;
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base">Analytics</CardTitle>
          <p className="text-xs text-muted-foreground">Auswertung der letzten {days} Tage</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              variant={range === r.value ? "default" : "outline"}
              size="sm"
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI-Karten */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiTile
                icon={CheckCircle2}
                label="Zustellquote"
                value={
                  stats.deliveryRate != null ? `${stats.deliveryRate.toFixed(1)} %` : "—"
                }
                hint={`${stats.totalFinished} abgeschlossen`}
                tone="success"
              />
              <KpiTile
                icon={Clock}
                label="Ø Zustellzeit"
                value={
                  stats.avgDeliveryHours != null
                    ? formatDuration(stats.avgDeliveryHours)
                    : "—"
                }
                hint="Auftrag bis Zustellung"
                tone="primary"
              />
              <KpiTile
                icon={AlertTriangle}
                label="Hindernisquote"
                value={
                  stats.failureRate != null ? `${stats.failureRate.toFixed(1)} %` : "—"
                }
                hint="Nicht zugestellt"
                tone="warning"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Wochentag-Verteilung */}
              <div className="rounded-xl border border-border/50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Wochentag-Verteilung
                </div>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.weekdayData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                          color: "hsl(var(--foreground))",
                        }}
                      />
                      <Bar dataKey="sendungen" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Empfänger */}
              <div className="rounded-xl border border-border/50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  Top 10 Empfänger
                </div>
                {stats.topRecipients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Daten im Zeitraum.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {stats.topRecipients.map(([name, count], i) => (
                      <li
                        key={`${name}-${i}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="truncate text-foreground">
                          <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                          {name}
                        </span>
                        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Top Hindernisgründe */}
            {stats.topReasons.length > 0 && (
              <div className="rounded-xl border border-border/50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Häufigste Hindernisgründe
                </div>
                <ul className="space-y-1.5 text-sm">
                  {stats.topReasons.map(([reason, count], i) => (
                    <li key={`${reason}-${i}`} className="flex items-center justify-between gap-3">
                      <span className="truncate text-foreground">{reason}</span>
                      <span className="shrink-0 rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        {count}×
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: "success" | "primary" | "warning";
}) {
  const toneClasses = {
    success: "bg-success/10 text-success",
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
  }[tone];
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border/50 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-[10px] text-muted-foreground/80">{hint}</p>
      </div>
    </div>
  );
}