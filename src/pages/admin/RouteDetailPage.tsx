import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Plus, Sparkles, Trash2, GripVertical, Bike, Car, Zap } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Depot { id: string; name: string; lat: number | null; lng: number | null; is_default: boolean; }
interface RouteRow {
  id: string; name: string; datum: string; status: string; notizen: string | null;
  start_depot_id: string | null; end_depot_id: string | null;
  total_distance_m: number | null; total_duration_s: number | null;
  geometry: GeoJSON.Geometry | null; optimized_at: string | null;
}
interface OrderRow {
  id: string; auftrags_nr: string; empfaenger_name: string; empfaenger_adresse: string | null;
  empfaenger_plz: string | null; empfaenger_stadt: string; lat: number | null; lng: number | null;
  status: string;
}
interface StopRow {
  id: string; route_id: string; order_id: string; position: number;
  leg_distance_m: number | null; leg_duration_s: number | null; status: string;
  orders: OrderRow;
}

type Profile = "cycling-electric" | "cycling-regular" | "driving-car";
const PROFILE_LABEL: Record<Profile, string> = {
  "cycling-electric": "E-Lastenrad",
  "cycling-regular": "Fahrrad",
  "driving-car": "Auto/Van",
};

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

function SortableStop({ stop, index, onRemove }: { stop: StopRow; index: number; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border bg-card p-2">
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground" aria-label="Verschieben">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{stop.orders.empfaenger_name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {stop.orders.auftrags_nr} · {stop.orders.empfaenger_plz} {stop.orders.empfaenger_stadt}
        </div>
        {(stop.leg_distance_m != null || stop.leg_duration_s != null) && (
          <div className="text-xs text-muted-foreground">
            Etappe: {formatDistance(stop.leg_distance_m)} · {formatDuration(stop.leg_duration_s)}
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={() => onRemove(stop.id)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

const RouteDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [route, setRoute] = useState<RouteRow | null>(null);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [profile, setProfile] = useState<Profile>("cycling-electric");
  const [addOpen, setAddOpen] = useState(false);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [r, s, d] = await Promise.all([
      supabase.from("routes").select("*").eq("id", id).single(),
      supabase.from("route_stops")
        .select("id, route_id, order_id, position, leg_distance_m, leg_duration_s, status, orders(id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, lat, lng, status)")
        .eq("route_id", id)
        .order("position", { ascending: true }),
      supabase.from("depots").select("id, name, lat, lng, is_default").eq("active", true).order("name"),
    ]);
    setRoute(r.data as unknown as RouteRow | null);
    setStops((s.data as unknown as StopRow[]) ?? []);
    setDepots((d.data as Depot[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const startDepot = useMemo(() => depots.find((x) => x.id === route?.start_depot_id) ?? depots.find((x) => x.is_default) ?? null, [depots, route]);
  const endDepot = useMemo(() => depots.find((x) => x.id === route?.end_depot_id) ?? startDepot, [depots, route, startDepot]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [7.4653, 51.5136], // Dortmund
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Render markers + route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // Clear markers
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
        const el = document.createElement("div");
        el.className = "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold border-2 border-white shadow cursor-pointer";
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

      // Route line
      if (map.getLayer("route-line")) map.removeLayer("route-line");
      if (map.getSource("route")) map.removeSource("route");
      if (route?.geometry) {
        map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: route.geometry } });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
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
    // persist positions
    await Promise.all(reordered.map((s) => supabase.from("route_stops").update({ position: s.position }).eq("id", s.id)));
  };

  const removeStop = async (stopId: string) => {
    const { error } = await supabase.from("route_stops").delete().eq("id", stopId);
    if (error) { toast.error("Stop konnte nicht entfernt werden"); return; }
    setStops((prev) => prev.filter((s) => s.id !== stopId));
  };

  const updateDepot = async (which: "start" | "end", value: string) => {
    const patch = which === "start" ? { start_depot_id: value } : { end_depot_id: value };
    const { error } = await supabase.from("routes").update(patch).eq("id", id!);
    if (error) { toast.error("Depot konnte nicht gespeichert werden"); return; }
    setRoute((r) => (r ? { ...r, ...patch } as RouteRow : r));
  };

  const optimize = async () => {
    if (stops.length < 2) { toast.error("Mindestens 2 Stops nötig"); return; }
    if (!startDepot?.lat || !endDepot?.lat) { toast.error("Bitte Start- und Ziel-Depot wählen (mit Koordinaten)"); return; }
    setOptimizing(true);
    const { data, error } = await supabase.functions.invoke("optimize-route", {
      body: { routeId: id, profile },
    });
    setOptimizing(false);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? "Optimierung fehlgeschlagen");
      return;
    }
    toast.success(`Route optimiert: ${formatDistance((data as { total_distance_m: number }).total_distance_m)} · ${formatDuration((data as { total_duration_s: number }).total_duration_s)}`);
    load();
  };

  return (
    <AdminLayout title={route?.name ?? "Route"}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/routen")}>
            <ArrowLeft className="mr-2 h-4 w-4" />Zurück
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{route?.datum && new Date(route.datum).toLocaleDateString("de-DE")}</Badge>
            <Badge>{route?.status}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* LEFT: Settings + Stops */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Einstellungen</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Start-Depot</Label>
                  <Select value={startDepot?.id ?? ""} onValueChange={(v) => updateDepot("start", v)}>
                    <SelectTrigger><SelectValue placeholder="Auswählen" /></SelectTrigger>
                    <SelectContent>
                      {depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.is_default ? " (Standard)" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Ziel-Depot</Label>
                  <Select value={endDepot?.id ?? ""} onValueChange={(v) => updateDepot("end", v)}>
                    <SelectTrigger><SelectValue placeholder="Auswählen" /></SelectTrigger>
                    <SelectContent>
                      {depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.is_default ? " (Standard)" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Fahrzeugprofil</Label>
                  <Select value={profile} onValueChange={(v) => setProfile(v as Profile)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cycling-electric"><div className="flex items-center gap-2"><Zap className="h-3 w-3" />{PROFILE_LABEL["cycling-electric"]}</div></SelectItem>
                      <SelectItem value="cycling-regular"><div className="flex items-center gap-2"><Bike className="h-3 w-3" />{PROFILE_LABEL["cycling-regular"]}</div></SelectItem>
                      <SelectItem value="driving-car"><div className="flex items-center gap-2"><Car className="h-3 w-3" />{PROFILE_LABEL["driving-car"]}</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={optimize} disabled={optimizing || stops.length < 2}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {optimizing ? "Optimiere..." : "Route optimieren"}
                </Button>
                {route?.optimized_at && (
                  <div className="rounded-md bg-muted p-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Strecke</span><span className="font-medium">{formatDistance(route.total_distance_m)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fahrzeit</span><span className="font-medium">{formatDuration(route.total_duration_s)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Optimiert</span><span>{new Date(route.optimized_at).toLocaleString("de-DE")}</span></div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Stops ({stops.length})</CardTitle>
                <AddStopsDialog routeId={id!} existingOrderIds={stops.map((s) => s.order_id)} open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-sm text-muted-foreground">Lade...</div>
                ) : stops.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Noch keine Stops. Füge Bestellungen hinzu.
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {stops.map((s, i) => <SortableStop key={s.id} stop={s} index={i} onRemove={removeStop} />)}
                      </div>
                    </SortableContext>
                  </DndContext>
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
      </div>
    </AdminLayout>
  );
};

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
      .select("id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, lat, lng, status")
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
    const rows = Array.from(selected).map((order_id, i) => ({ route_id: routeId, order_id, position: i + 1 }));
    const { error } = await supabase.from("route_stops").insert(rows);
    if (error) { toast.error("Stops konnten nicht hinzugefügt werden"); return; }
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
                      <div className="text-xs text-muted-foreground">{o.empfaenger_adresse}, {o.empfaenger_plz} {o.empfaenger_stadt}</div>
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

export default RouteDetailPage;