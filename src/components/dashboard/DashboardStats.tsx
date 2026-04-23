import { useState, useMemo } from "react";
import { Package, Truck, CheckCircle2, AlertCircle, Leaf } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Order } from "@/types/order";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type TimeRange = "heute" | "woche" | "monat" | "alle";

interface DashboardStatsProps {
  orders: Order[];
}

function filterByRange(orders: Order[], range: TimeRange): Order[] {
  if (range === "alle") return orders;
  const now = new Date();
  const start = new Date();
  if (range === "heute") start.setHours(0, 0, 0, 0);
  else if (range === "woche") start.setDate(now.getDate() - 7);
  else if (range === "monat") start.setMonth(now.getMonth() - 1);
  return orders.filter((o) => new Date(o.erstelltAm) >= start);
}

function getChartData(orders: Order[]) {
  const grouped: Record<string, number> = {};
  orders.forEach((o) => {
    const d = o.erstelltAm;
    grouped[d] = (grouped[d] || 0) + 1;
  });
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, count]) => ({ date, auftraege: count }));
}

// ~0.5 kg CO2 saved per package vs diesel delivery (bike/e-cargo vs van)
const CO2_PER_PACKAGE = 0.5;

export function DashboardStats({ orders }: DashboardStatsProps) {
  const [range, setRange] = useState<TimeRange>("alle");
  const filtered = useMemo(() => filterByRange(orders, range), [orders, range]);
  const chartData = useMemo(() => getChartData(filtered), [filtered]);

  const co2Saved = useMemo(
    () => filtered.reduce((acc, o) => acc + o.pakete * CO2_PER_PACKAGE, 0).toFixed(1),
    [filtered]
  );

  const stats = [
    { label: "Gesamt", value: filtered.length, icon: Package, color: "text-primary", bg: "bg-primary/10" },
    { label: "Unterwegs", value: filtered.filter((o) => o.status === "unterwegs").length, icon: Truck, color: "text-primary", bg: "bg-primary/10" },
    { label: "Zugestellt", value: filtered.filter((o) => o.status === "zugestellt").length, icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
    { label: "Offen", value: filtered.filter((o) => o.status === "neu" || o.status === "in_bearbeitung").length, icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
    { label: "Nicht zugestellt", value: filtered.filter((o) => o.status === "nicht_zugestellt").length, icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
  ];

  const ranges: { label: string; value: TimeRange }[] = [
    { label: "Heute", value: "heute" },
    { label: "7 Tage", value: "woche" },
    { label: "30 Tage", value: "monat" },
    { label: "Alle", value: "alle" },
  ];

  return (
    <div className="space-y-6">
      {/* Time range filter */}
      <div className="flex flex-wrap gap-2">
        {ranges.map((r) => (
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
        {/* CO2 card */}
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10">
              <Leaf className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{co2Saved} kg</p>
              <p className="text-xs text-muted-foreground">CO₂ gespart</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Auftragsvolumen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Line type="monotone" dataKey="auftraege" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
