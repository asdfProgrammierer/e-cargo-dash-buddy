import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { MapPin, Plus, Sparkles, Trash2, GripVertical, Bike, Car, Zap, Printer, AlertTriangle, CheckCircle2, SkipForward, Circle } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Depot { id: string; name: string; lat: number | null; lng: number | null; is_default: boolean; }
interface Vehicle { id: string; kennzeichen: string; kapazitaet_kg: number; typ: string | null; }
interface RouteRow {
  id: string; name: string; datum: string; status: string; notizen: string | null;
  start_depot_id: string | null; end_depot_id: string | null;
  vehicle_id: string | null;
  total_distance_m: number | null; total_duration_s: number | null;
  geometry: GeoJSON.Geometry | null; optimized_at: string | null;
  start_time: string | null;
}
interface OrderRow {
  id: string; auftrags_nr: string; empfaenger_name: string; empfaenger_adresse: string | null;
  empfaenger_plz: string | null; empfaenger_stadt: string;
  empfaenger_telefon: string | null;
  pakete: number; gewicht: number;
  lat: number | null; lng: number | null;
  status: string; notizen: string | null;
}
interface StopRow {
  id: string; route_id: string; order_id: string; position: number;
  leg_distance_m: number | null; leg_duration_s: number | null;
  eta: string | null;
  status: "offen" | "erledigt" | "uebersprungen";
  orders: OrderRow;
}

type Profile = "cycling-electric" | "cycling-regular" | "driving-car";
const PROFILE_LABEL: Record<Profile, string> = {
  "cycling-electric": "E-Lastenrad",
  "cycling-regular": "Fahrrad",
  "driving-car": "Auto/Van",
};

function profileFromVehicleType(typ: string | null | undefined): Profile {
  switch (typ) {
    case "lastenrad": return "cycling-electric";
    case "e_van":
    case "transporter":
    case "sonstige":
    default: return "driving-car";
  }
}

function formatDuration(s: number | null) {
  if (s == null) return "–";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}
function formatDistance(m: number | null) {
  if (m == null) return "–";
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatTime(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

// Interpret "YYYY-MM-DD" + "HH:mm" as Europe/Berlin local time and return UTC ms.
function berlinLocalToUtcMs(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const utcGuess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  const offsetMin = Math.round((asUtc - utcGuess) / 60_000);
  return utcGuess - offsetMin * 60_000;
}

const STATUS_ICON = {
  offen: Circle,
  erledigt: CheckCircle2,
  uebersprungen: SkipForward,
} as const;
const STATUS_COLOR = {
  offen: "text-muted-foreground",
  erledigt: "text-success",
  uebersprungen: "text-warning",
} as const;

const STATUS_DOT: Record<StopRow["status"], string> = {
  offen: "bg-muted-foreground/40",
  erledigt: "bg-success shadow-[0_0_8px_hsl(var(--success)/0.4)]",
  uebersprungen: "bg-warning shadow-[0_0_8px_hsl(var(--warning)/0.4)]",
};

function SortableStop({ stop, index, onRemove, onCycleStatus }: {
  stop: StopRow; index: number;
  onRemove: (id: string) => void;
  onCycleStatus: (id: string, current: StopRow["status"]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-3 px-3 py-2 bg-card hover:bg-surface-muted transition-colors duration-fast ease-fast-out border-b border-border/50 last:border-b-0"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
        aria-label="Verschieben"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-5 text-right shrink-0">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-body font-medium truncate ${stop.status === "erledigt" ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {stop.orders.empfaenger_name}
        </p>
        <div className="flex items-center gap-2 text-caption text-muted-foreground tabular-nums truncate">
          <span className="truncate">{stop.orders.auftrags_nr} · {stop.orders.empfaenger_plz} {stop.orders.empfaenger_stadt}</span>
        </div>
        <div className="text-caption text-muted-foreground tabular-nums truncate">
          {stop.orders.pakete} Paket(e) · {Number(stop.orders.gewicht).toFixed(1)} kg
          {(stop.leg_distance_m != null || stop.leg_duration_s != null) && (
            <> · {formatDistance(stop.leg_distance_m)} · {formatDuration(stop.leg_duration_s)}</>
          )}
        </div>
      </div>
      {formatTime(stop.eta) && (
        <span
          className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary tabular-nums"
          title="Geschätzte Ankunftszeit"
        >
          {formatTime(stop.eta)}
        </span>
      )}
      <button
        onClick={() => onCycleStatus(stop.id, stop.status)}
        title={`Status: ${stop.status} (klicken zum Wechseln)`}
        className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[stop.status]}`}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(stop.id)}
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}

interface RouteBuilderProps {
  routeId: string;
  /** When true, hide the inner map column (used as compact panel). Default false. */
  compact?: boolean;
}

export function RouteBuilder({ routeId, compact = false }: RouteBuilderProps) {
  const [route, setRoute] = useState<RouteRow | null>(null);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [stopDurationMin, setStopDurationMin] = useState<number>(4);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    setLoading(true);
    const [r, s, d] = await Promise.all([
      supabase.from("routes").select("*").eq("id", routeId).single(),
      supabase.from("route_stops")
        .select("id, route_id, order_id, position, leg_distance_m, leg_duration_s, eta, status, orders(id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_telefon, pakete, gewicht, lat, lng, status, notizen)")
        .eq("route_id", routeId)
        .order("position", { ascending: true }),
      supabase.from("depots").select("id, name, lat, lng, is_default").eq("active", true).order("name"),
    ]);
    const routeData = r.data as unknown as RouteRow | null;
    setRoute(routeData);
    const stopRows = (s.data as unknown as StopRow[]) ?? [];
    setStops(stopRows);
    setDepots((d.data as Depot[]) ?? []);
    // Load global stop duration (best-effort)
    const { data: settings } = await supabase
      .from("route_settings")
      .select("stop_duration_minutes")
      .eq("id", 1)
      .maybeSingle();
    setStopDurationMin(settings?.stop_duration_minutes ?? 4);
    if (routeData?.vehicle_id) {
      const { data: v } = await supabase.from("vehicles").select("id, kennzeichen, kapazitaet_kg, typ").eq("id", routeData.vehicle_id).maybeSingle();
      setVehicle(v as Vehicle | null);
    } else {
      setVehicle(null);
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [routeId]);

  const startDepot = useMemo(() => depots.find((x) => x.id === route?.start_depot_id) ?? depots.find((x) => x.is_default) ?? null, [depots, route]);
  const endDepot = useMemo(() => depots.find((x) => x.id === route?.end_depot_id) ?? startDepot, [depots, route, startDepot]);
  const profile: Profile = useMemo(() => profileFromVehicleType(vehicle?.typ), [vehicle]);

  const totals = useMemo(() => {
    const pakete = stops.reduce((a, s) => a + (s.orders.pakete ?? 0), 0);
    const gewicht = stops.reduce((a, s) => a + Number(s.orders.gewicht ?? 0), 0);
    return { pakete, gewicht };
  }, [stops]);
  const overCapacity = vehicle && vehicle.kapazitaet_kg > 0 && totals.gewicht > Number(vehicle.kapazitaet_kg);
  const capacityPct = vehicle && vehicle.kapazitaet_kg > 0 ? Math.min(100, (totals.gewicht / Number(vehicle.kapazitaet_kg)) * 100) : 0;

  // Compute display stops with a live-ETA fallback when leg_duration_s is known
  // but eta has not been persisted yet. Persisted eta wins.
  const displayStops = useMemo<StopRow[]>(() => {
    if (!route?.datum) return stops;
    const startTime = (route.start_time ?? "09:00").slice(0, 5);
    const baseMs = berlinLocalToUtcMs(route.datum, startTime);
    if (isNaN(baseMs)) return stops;
    let cursor = baseMs;
    return stops.map((s) => {
      if (s.leg_duration_s == null) return s;
      cursor += s.leg_duration_s * 1000;
      const eta = s.eta ?? new Date(cursor).toISOString();
      cursor += stopDurationMin * 60 * 1000;
      return { ...s, eta };
    });
  }, [stops, route, stopDurationMin]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors © CARTO",
          },
        },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
      },
      center: [7.4653, 51.5136],
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Resize map when route changes (panel may have been hidden)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.resize(), 100);
    return () => clearTimeout(t);
  }, [routeId]);

  // Render markers + route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const bounds = new maplibregl.LngLatBounds();
      let hasPoint = false;

      if (startDepot?.lat && startDepot?.lng) {
        const el = document.createElement("div");
        el.className = "flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold border-2 border-white shadow";
        el.textContent = "S";
        const m = new maplibregl.Marker({ element: el }).setLngLat([Number(startDepot.lng), Number(startDepot.lat)]).addTo(map);
        markersRef.current.push(m);
        bounds.extend([Number(startDepot.lng), Number(startDepot.lat)]);
        hasPoint = true;
      }
      stops.forEach((s, idx) => {
        if (s.orders.lat == null || s.orders.lng == null) return;
        const done = s.status === "erledigt";
        const skip = s.status === "uebersprungen";
        const bg = done ? "bg-emerald-500" : skip ? "bg-amber-500" : "bg-primary";
        const el = document.createElement("div");
        el.className = `flex h-7 w-7 items-center justify-center rounded-full ${bg} text-white text-xs font-bold border-2 border-white shadow cursor-pointer`;
        el.textContent = String(idx + 1);
        const m = new maplibregl.Marker({ element: el }).setLngLat([Number(s.orders.lng), Number(s.orders.lat)])
          .setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(`<strong>${s.orders.empfaenger_name}</strong><br/>${s.orders.auftrags_nr}`))
          .addTo(map);
        markersRef.current.push(m);
        bounds.extend([Number(s.orders.lng), Number(s.orders.lat)]);
        hasPoint = true;
      });
      if (endDepot?.lat && endDepot?.lng && endDepot.id !== startDepot?.id) {
        const el = document.createElement("div");
        el.className = "flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-white text-xs font-bold border-2 border-white shadow";
        el.textContent = "Z";
        const m = new maplibregl.Marker({ element: el }).setLngLat([Number(endDepot.lng), Number(endDepot.lat)]).addTo(map);
        markersRef.current.push(m);
        bounds.extend([Number(endDepot.lng), Number(endDepot.lat)]);
        hasPoint = true;
      }

      if (map.getLayer("route-line")) map.removeLayer("route-line");
      if (map.getSource("route")) map.removeSource("route");
      if (route?.geometry) {
        map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: route.geometry } });
        map.addLayer({
          id: "route-line", type: "line", source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "hsl(142 71% 45%)", "line-width": 4, "line-opacity": 0.85 },
        });
      }

      if (hasPoint) {
        try { map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 }); } catch { /* noop */ }
      }
    };
    if (map.loaded()) apply();
    else map.once("load", apply);
  }, [stops, startDepot, endDepot, route]);

  const handleDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = stops.findIndex((s) => s.id === e.active.id);
    const newIdx = stops.findIndex((s) => s.id === e.over!.id);
    const reordered = arrayMove(stops, oldIdx, newIdx).map((s, i) => ({ ...s, position: i + 1 }));
    setStops(reordered);
    await Promise.all(reordered.map((s) => supabase.from("route_stops").update({ position: s.position }).eq("id", s.id)));
  };

  const removeStop = async (stopId: string) => {
    const stop = stops.find((s) => s.id === stopId);
    const { error } = await supabase.from("route_stops").delete().eq("id", stopId);
    if (error) { toast.error("Stop konnte nicht entfernt werden"); return; }
    // Reset order status back to "neu" when removed from route
    if (stop?.order_id) {
      await supabase.from("orders").update({ status: "neu" }).eq("id", stop.order_id);
    }
    setStops((prev) => prev.filter((s) => s.id !== stopId));
  };

  const cycleStatus = async (stopId: string, current: StopRow["status"]) => {
    const next: StopRow["status"] = current === "offen" ? "erledigt" : current === "erledigt" ? "uebersprungen" : "offen";
    const { error } = await supabase.from("route_stops").update({ status: next }).eq("id", stopId);
    if (error) { toast.error("Status konnte nicht aktualisiert werden"); return; }
    setStops((prev) => prev.map((s) => s.id === stopId ? { ...s, status: next } : s));
  };

  const optimize = async () => {
    if (stops.length < 2) { toast.error("Mindestens 2 Stops nötig"); return; }
    if (!startDepot?.lat || !endDepot?.lat) { toast.error("Start-/Ziel-Depot fehlt – bitte in der Route hinterlegen"); return; }
    setOptimizing(true);
    const { data, error } = await supabase.functions.invoke("optimize-route", {
      body: { routeId, profile },
    });
    setOptimizing(false);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? "Optimierung fehlgeschlagen");
      return;
    }
    toast.success(`Route optimiert: ${formatDistance((data as { total_distance_m: number }).total_distance_m)} · ${formatDuration((data as { total_duration_s: number }).total_duration_s)}`);
    load();
  };

  const openPrint = () => window.open(`/admin/routen/${routeId}/druck`, "_blank");

  if (compact) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 shrink-0">
            <CardTitle className="text-base">Stops ({stops.length})</CardTitle>
            <div className="flex items-center gap-1">
              <AddStopsDialog routeId={routeId} existingOrderIds={stops.map((s) => s.order_id)} open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
              <Button size="sm" variant="outline" onClick={optimize} disabled={optimizing || stops.length < 2}>
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                {optimizing ? "Optimiere…" : "Optimieren"}
              </Button>
              <Button size="sm" variant="outline" onClick={openPrint} title="PDF-Druck">
                <Printer className="mr-1 h-3.5 w-3.5" />PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-2 flex-1 min-h-0 flex flex-col">
            <div className="px-4 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground shrink-0">
              <span><span className="text-foreground font-medium">Start:</span> {startDepot?.name ?? "–"}</span>
              <span><span className="text-foreground font-medium">Ziel:</span> {endDepot?.name ?? "–"}</span>
              {vehicle && (
                <span className="inline-flex items-center gap-1">
                  {profile === "driving-car" ? <Car className="h-3 w-3" /> : profile === "cycling-electric" ? <Zap className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
                  {vehicle.kennzeichen} · {PROFILE_LABEL[profile]}
                </span>
              )}
            </div>

            {vehicle && (
              <div className="mx-4 mb-2 rounded-md border border-border/50 p-2 space-y-1 shrink-0">
                <div className="flex items-center justify-between text-caption">
                  <span className="text-muted-foreground">Auslastung {vehicle.kennzeichen}</span>
                  <span className={overCapacity ? "text-destructive font-medium tabular-nums" : "font-medium tabular-nums"}>
                    {totals.gewicht.toFixed(1)} / {Number(vehicle.kapazitaet_kg).toFixed(0)} kg
                  </span>
                </div>
                <Progress value={capacityPct} className={overCapacity ? "bg-destructive/20" : undefined} />
              </div>
            )}

            {loading ? (
              <div className="px-4 text-caption text-muted-foreground shrink-0">Lade…</div>
            ) : stops.length === 0 ? (
              <div className="mx-4 rounded-md border border-dashed p-6 text-center text-caption text-muted-foreground shrink-0">
                Noch keine Stops. Wähle unten rechts Bestellungen aus und füge sie hinzu.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="border-y border-border/50">
                      {displayStops.map((s, i) => <SortableStop key={s.id} stop={s} index={i} onRemove={removeStop} onCycleStatus={cycleStatus} />)}
                    </div>
                  </ScrollArea>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* LEFT: Settings + Stops */}
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Einstellungen</CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={openPrint} title="PDF-Druck"><Printer className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-2 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span className="font-medium">{startDepot?.name ?? "–"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ziel</span><span className="font-medium">{endDepot?.name ?? "–"}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Fahrzeug</span>
                <span className="font-medium inline-flex items-center gap-1">
                  {profile === "driving-car" ? <Car className="h-3 w-3" /> : profile === "cycling-electric" ? <Zap className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
                  {vehicle ? `${vehicle.kennzeichen} · ${PROFILE_LABEL[profile]}` : PROFILE_LABEL[profile]}
                </span>
              </div>
            </div>
            <Button className="w-full" onClick={optimize} disabled={optimizing || stops.length < 2}>
              <Sparkles className="mr-2 h-4 w-4" />
              {optimizing ? "Optimiere..." : "Route optimieren"}
            </Button>

            {/* Capacity */}
            {vehicle && (
              <div className="rounded-md border p-2 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Auslastung {vehicle.kennzeichen}</span>
                  <span className={overCapacity ? "text-destructive font-medium" : "font-medium"}>
                    {totals.gewicht.toFixed(1)} / {Number(vehicle.kapazitaet_kg).toFixed(0)} kg
                  </span>
                </div>
                <Progress value={capacityPct} className={overCapacity ? "bg-destructive/20" : undefined} />
                {overCapacity && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" />Überlast!
                  </div>
                )}
              </div>
            )}

            {/* Totals */}
            <div className="rounded-md bg-muted p-2 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Pakete gesamt</span><span className="font-medium">{totals.pakete}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Gewicht gesamt</span><span className="font-medium">{totals.gewicht.toFixed(1)} kg</span></div>
              {route?.optimized_at && <>
                <div className="flex justify-between"><span className="text-muted-foreground">Strecke</span><span className="font-medium">{formatDistance(route.total_distance_m)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fahrzeit</span><span className="font-medium">{formatDuration(route.total_duration_s)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Optimiert</span><span>{new Date(route.optimized_at).toLocaleString("de-DE")}</span></div>
              </>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Stops ({stops.length})</CardTitle>
            <AddStopsDialog routeId={routeId} existingOrderIds={stops.map((s) => s.order_id)} open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {loading ? (
              <div className="px-4 text-sm text-muted-foreground">Lade...</div>
            ) : stops.length === 0 ? (
              <div className="mx-4 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Noch keine Stops. Füge Bestellungen hinzu.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="border-y border-border/50">
                    {displayStops.map((s, i) => <SortableStop key={s.id} stop={s} index={i} onRemove={removeStop} onCycleStatus={cycleStatus} />)}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            {stops.length > 0 && (
              <div className="mt-2 px-4 text-caption text-muted-foreground">
                Tipp: Auf den Status-Punkt klicken, um zwischen offen → erledigt → übersprungen zu wechseln.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* RIGHT: Map */}
      <div className="lg:col-span-2">
        <Card className="overflow-hidden">
          <div ref={containerRef} className="h-[70vh] w-full" />
        </Card>
      </div>
    </div>
  );
}

function AddStopsDialog({ routeId, existingOrderIds, open, onOpenChange, onAdded }: {
  routeId: string; existingOrderIds: string[]; open: boolean; onOpenChange: (v: boolean) => void; onAdded: () => void;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    supabase
      .from("orders")
      .select("id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_telefon, pakete, gewicht, lat, lng, status, notizen")
      .in("status", ["neu", "in_bearbeitung"])
      .not("lat", "is", null)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        const filtered = ((data as OrderRow[]) ?? []).filter((o) => !existingOrderIds.includes(o.id));
        setOrders(filtered);
        setLoading(false);
      });
  }, [open, existingOrderIds]);

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return o.auftrags_nr.toLowerCase().includes(q) || o.empfaenger_name.toLowerCase().includes(q) || (o.empfaenger_plz ?? "").includes(q) || o.empfaenger_stadt.toLowerCase().includes(q);
  });

  const add = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const rows = ids.map((order_id, i) => ({ route_id: routeId, order_id, position: i + 1 }));
    const { error } = await supabase.from("route_stops").insert(rows);
    if (error) { toast.error("Stops konnten nicht hinzugefügt werden"); return; }
    // Move selected orders to "in_bearbeitung" so they leave the "Neu" pool
    await supabase.from("orders").update({ status: "in_bearbeitung" }).in("id", ids);
    toast.success(`${rows.length} Stop(s) hinzugefügt`);
    onOpenChange(false);
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="mr-2 h-4 w-4" />Stops</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bestellungen hinzufügen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Suche: Auftragsnr, Name, PLZ, Stadt..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="text-xs text-muted-foreground">Nur geocodierte Bestellungen mit Status "Neu" oder "In Bearbeitung" werden angezeigt.</div>
          <ScrollArea className="h-[50vh] rounded-md border">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Lade...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">Keine passenden Bestellungen gefunden.</div>
            ) : (
              <div className="divide-y">
                {filtered.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-accent">
                    <Checkbox checked={selected.has(o.id)} onCheckedChange={(c) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (c) next.add(o.id); else next.delete(o.id);
                        return next;
                      });
                    }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {o.empfaenger_name}
                        <span className="text-xs text-muted-foreground">({o.auftrags_nr})</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{o.empfaenger_adresse}, {o.empfaenger_plz} {o.empfaenger_stadt} · {o.pakete} Paket(e), {Number(o.gewicht).toFixed(1)} kg</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{selected.size} ausgewählt</div>
            <Button onClick={add} disabled={selected.size === 0}>Hinzufügen</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
