import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Loader2, MapPin, Percent, Timer, Target } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Merchant = { user_id: string; firma_name: string | null; ansprechpartner: string | null };
type StatsResponse = {
  kpis: {
    total: number;
    delivered_cnt: number;
    first_try_cnt: number;
    avg_hours: number | null;
    median_hours: number | null;
  };
  heatmap: Array<{ plz: string; stadt: string; pakete: number; auftraege: number; lat: number; lng: number }>;
};

type Preset = "all" | "7" | "30" | "custom";

function presetRange(preset: Preset, custom: { from?: Date; to?: Date }): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (preset) {
    case "all": return { from: null, to: null };
    case "7": return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30": return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "custom":
      return {
        from: custom.from ? startOfDay(custom.from) : null,
        to: custom.to ? endOfDay(custom.to) : null,
      };
  }
}


function formatHours(h: number | null | undefined): string {
  if (h == null || !isFinite(h)) return "–";
  if (h < 24) return `${h.toFixed(1)} h`;
  const days = Math.floor(h / 24);
  const rem = Math.round(h - days * 24);
  return `${days}d ${rem}h`;
}

function MerchantMultiSelect({
  merchants,
  selected,
  onChange,
}: {
  merchants: Merchant[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      merchants.filter((m) =>
        (m.firma_name || m.ansprechpartner || "").toLowerCase().includes(q.toLowerCase()),
      ),
    [merchants, q],
  );
  const allSelected = selected.length === 0;
  const label =
    allSelected
      ? "Alle Händler"
      : selected.length === 1
        ? merchants.find((m) => m.user_id === selected[0])?.firma_name ||
          merchants.find((m) => m.user_id === selected[0])?.ansprechpartner ||
          "1 Händler"
        : `${selected.length} Händler`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 min-w-[200px] justify-between text-sm font-normal">
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[999] w-[320px] p-0" align="start">
        <div className="border-b p-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Händler suchen…"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          <button
            className="text-primary hover:underline"
            onClick={() => onChange([])}
          >
            Alle auswählen
          </button>
          <span className="text-muted-foreground">
            {selected.length}/{merchants.length}
          </span>
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {filtered.map((m) => {
              const checked = selected.includes(m.user_id);
              const name = m.firma_name || m.ansprechpartner || m.user_id.slice(0, 8);
              return (
                <label
                  key={m.user_id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      if (v) onChange([...selected, m.user_id]);
                      else onChange(selected.filter((id) => id !== m.user_id));
                    }}
                  />
                  <span className="truncate">{name}</span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">Keine Treffer</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function HeatMap({ points }: { points: StatsResponse["heatmap"] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Startzentrum Ruhrgebiet
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([51.5, 7.2], 10);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (points.length === 0) return;
    const max = Math.max(...points.map((p) => p.pakete));
    const data: [number, number, number][] = points.map((p) => [p.lat, p.lng, p.pakete / max]);
    // @ts-expect-error leaflet.heat erweitert L
    const heat = L.heatLayer(data, { radius: 30, blur: 25, maxZoom: 14 });
    heat.addTo(map);
    layerRef.current = heat;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }, [points]);

  return <div ref={containerRef} className="h-[520px] w-full rounded-md border" />;
}

export default function StatistikenPage() {
  const [preset, setPreset] = useState<Preset>("30");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);

  const range = useMemo(
    () => presetRange(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );

  const merchantsQuery = useQuery({
    queryKey: ["stats-merchants"],
    queryFn: async (): Promise<Merchant[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, firma_name, ansprechpartner")
        .eq("approved", true)
        .is("parent_user_id", null)
        .order("firma_name", { ascending: true });
      if (error) throw error;
      return (data || []) as Merchant[];
    },
  });

  const statsQuery = useQuery({
    queryKey: [
      "admin-delivery-stats",
      range.from?.toISOString() ?? "all",
      range.to?.toISOString() ?? "all",
      selectedMerchants.slice().sort().join(","),
    ],
    queryFn: async (): Promise<StatsResponse> => {
      const { data, error } = await supabase.rpc("admin_delivery_stats", {
        p_from: range.from ? range.from.toISOString() : null,
        p_to: range.to ? range.to.toISOString() : null,
        p_merchant_ids: selectedMerchants.length > 0 ? selectedMerchants : null,
      });
      if (error) throw error;
      return data as unknown as StatsResponse;
    },
  });


  const kpis = statsQuery.data?.kpis;
  const heatmap = statsQuery.data?.heatmap ?? [];

  const zustellquote = kpis && kpis.total > 0 ? (kpis.delivered_cnt / kpis.total) * 100 : null;
  const erstzustellrate =
    kpis && kpis.delivered_cnt > 0 ? (kpis.first_try_cnt / kpis.delivered_cnt) * 100 : null;

  return (
    <AdminLayout title="Statistiken">
      <div className="space-y-6">
        {/* Filterbereich */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filter</CardTitle>
            <CardDescription>
              {"\n"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: "all", label: "Alle" },
                { key: "7", label: "7 Tage" },
                { key: "30", label: "30 Tage" },
              ] as { key: Preset; label: string }[]
            ).map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? "default" : "outline"}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant={preset === "custom" ? "default" : "outline"}
                  className="gap-2"
                >
                  <CalendarIcon className="h-4 w-4" />
                  {preset === "custom" && customFrom && customTo
                    ? `${format(customFrom, "dd.MM.yyyy", { locale: de })} – ${format(customTo, "dd.MM.yyyy", { locale: de })}`
                    : "Zeitraum wählen"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: customFrom, to: customTo }}
                  onSelect={(r) => {
                    setCustomFrom(r?.from);
                    setCustomTo(r?.to);
                    if (r?.from && r?.to) setPreset("custom");
                  }}
                  numberOfMonths={2}
                  locale={de}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <div className="ml-auto">
              <MerchantMultiSelect
                merchants={merchantsQuery.data || []}
                selected={selectedMerchants}
                onChange={setSelectedMerchants}
              />
            </div>
          </CardContent>
        </Card>

        {/* KPI Kacheln */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Percent className="h-4 w-4" />}
            label="Zustellquote"
            value={zustellquote != null ? `${zustellquote.toFixed(1)}%` : "–"}
            sub={kpis ? `${kpis.delivered_cnt} / ${kpis.total} Aufträge` : ""}
            loading={statsQuery.isLoading}
          />
          <KpiCard
            icon={<Timer className="h-4 w-4" />}
            label="Ø Lieferzeit"
            value={formatHours(kpis?.avg_hours ?? null)}
            sub={kpis?.median_hours != null ? `Median: ${formatHours(kpis.median_hours)}` : ""}
            loading={statsQuery.isLoading}
          />
          <KpiCard
            icon={<Target className="h-4 w-4" />}
            label="Erstzustellrate"
            value={erstzustellrate != null ? `${erstzustellrate.toFixed(1)}%` : "–"}
            sub={kpis ? `${kpis.first_try_cnt} von ${kpis.delivered_cnt} beim 1. Versuch` : ""}
            loading={statsQuery.isLoading}
          />
          <KpiCard
            icon={<MapPin className="h-4 w-4" />}
            label="Aktive PLZ"
            value={heatmap.length.toString()}
            sub={heatmap.length > 0
              ? `${heatmap.reduce((s, p) => s + p.pakete, 0)} zugestellte Pakete`
              : "keine geokodierten Zustellungen"}
            loading={statsQuery.isLoading}
          />
        </div>

        {/* Heat Map */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Zustellungs-Heatmap</CardTitle>
                <CardDescription>
                  Aggregation der zugestellten Pakete je PLZ (Zentroid aus Geokoordinaten).
                </CardDescription>
              </div>
              {statsQuery.isFetching && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <HeatMap points={heatmap} />
            {heatmap.length === 0 && !statsQuery.isLoading && (
              <p className="mt-3 text-sm text-muted-foreground">
                Keine geokodierten Zustellungen im gewählten Zeitraum.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top PLZ */}
        {heatmap.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top-Zustellgebiete</CardTitle>
              <CardDescription>Sortiert nach Anzahl zugestellter Pakete.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {[...heatmap]
                  .sort((a, b) => b.pakete - a.pakete)
                  .slice(0, 12)
                  .map((p) => (
                    <div
                      key={`${p.plz}-${p.stadt}`}
                      className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">
                          {p.plz} {p.stadt}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.auftraege} Auftr{p.auftraege === 1 ? "ag" : "äge"}
                        </div>
                      </div>
                      <Badge variant="secondary" className="ml-2 shrink-0">
                        {p.pakete} Pakete
                      </Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : value}
        </div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}