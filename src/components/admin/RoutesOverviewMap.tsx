import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MapPin, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Depot { id: string; name: string; lat: number | null; lng: number | null; is_default: boolean; }
interface RouteRow {
  id: string; name: string; datum: string; status: "geplant" | "aktiv" | "abgeschlossen";
  start_depot_id: string | null; end_depot_id: string | null;
  geometry: GeoJSON.Geometry | null;
  drivers: { name: string } | null;
  vehicles: { kennzeichen: string } | null;
}
interface StopRow {
  id: string; route_id: string; position: number;
  status: "offen" | "erledigt" | "uebersprungen";
  orders: { id: string; auftrags_nr: string; empfaenger_name: string; empfaenger_adresse: string | null; empfaenger_plz: string | null; empfaenger_stadt: string; lat: number | null; lng: number | null; } | null;
}

interface DriverLoc {
  driver_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: string;
  driver_name: string | null;
}

// Distinct, accessible HSL palette for routes
const ROUTE_COLORS = [
  "hsl(142 71% 42%)",   // emerald
  "hsl(217 91% 55%)",   // blue
  "hsl(0 78% 55%)",     // red
  "hsl(38 92% 50%)",    // amber
  "hsl(280 67% 55%)",   // purple
  "hsl(190 80% 42%)",   // teal
  "hsl(330 75% 55%)",   // pink
  "hsl(20 85% 50%)",    // orange
];

const STATUS_LABELS: Record<RouteRow["status"], string> = {
  geplant: "Geplant",
  aktiv: "Aktiv",
  abgeschlossen: "Abgeschl.",
};

const STATUS_DOT: Record<RouteRow["status"], string> = {
  geplant: "bg-muted-foreground/40",
  aktiv: "bg-success shadow-[0_0_0_3px_hsl(var(--success)/0.18)]",
  abgeschlossen: "bg-primary/60",
};

interface Props {
  onSelectRoute?: (id: string) => void;
  /** When true, only render the map (parent provides its own controls). */
  mapOnly?: boolean;
  /** External date control (e.g. provided by parent toolbar). */
  date?: string;
  /** External "hidden routes" control. */
  hidden?: Set<string>;
  /** Highlight a single route (others get dimmed). */
  highlightRouteId?: string | null;
  /** Bumped by parent to force a reload. */
  refreshKey?: number;
  /** Optional new orders to also render on the map. */
  newOrders?: Array<{ id: string; auftrags_nr: string; empfaenger_name: string; empfaenger_adresse?: string | null; empfaenger_plz?: string | null; empfaenger_stadt: string; lat: number | null; lng: number | null; }>;
  /** Selected new order ids (highlighted). */
  selectedNewOrderIds?: Set<string>;
  /** Called when a new-order pin is clicked. */
  onNewOrderClick?: (id: string) => void;
}

export function RoutesOverviewMap({ onSelectRoute, mapOnly = false, date: dateProp, hidden: hiddenProp, highlightRouteId, refreshKey, newOrders = [], selectedNewOrderIds, onNewOrderClick }: Props) {
  const [dateState, setDateState] = useState(() => new Date().toISOString().slice(0, 10));
  const date = dateProp ?? dateState;
  const setDate = setDateState;
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [driverLocs, setDriverLocs] = useState<DriverLoc[]>([]);
  const [hiddenState, setHiddenState] = useState<Set<string>>(new Set());
  const hidden = hiddenProp ?? hiddenState;
  const setHidden = setHiddenState;
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const pinnedRef = useRef<boolean>(false);

  const colorByRoute = useMemo(() => {
    const m: Record<string, string> = {};
    routes.forEach((r, i) => { m[r.id] = ROUTE_COLORS[i % ROUTE_COLORS.length]; });
    return m;
  }, [routes]);

  const load = async () => {
    setLoading(true);
    const [r, d] = await Promise.all([
      supabase.from("routes")
        .select("id, name, datum, status, start_depot_id, end_depot_id, geometry, drivers(name), vehicles(kennzeichen)")
        .eq("datum", date)
        .order("name"),
      supabase.from("depots").select("id, name, lat, lng, is_default").eq("active", true),
    ]);
    const routeList = (r.data as unknown as RouteRow[]) ?? [];
    setRoutes(routeList);
    setDepots((d.data as Depot[]) ?? []);
    if (routeList.length > 0) {
      const ids = routeList.map((x) => x.id);
      const { data: s } = await supabase.from("route_stops")
        .select("id, route_id, position, status, orders(id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, lat, lng)")
        .in("route_id", ids)
        .order("position", { ascending: true });
      setStops((s as unknown as StopRow[]) ?? []);
    } else {
      setStops([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [date, refreshKey]);

  // Auto-refresh routes/stops every 30s so the map stays current without manual reload.
  useEffect(() => {
    const id = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(id);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [date]);

  // Realtime: reload immediately when route geometry/stops/status changes
  // (e.g. after admin optimizes a route, or a driver marks a stop in the app).
  useEffect(() => {
    let debounce: number | undefined;
    const trigger = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => { void load(); }, 300);
    };
    const channel = supabase
      .channel("routes-overview-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "route_stops" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "routes" }, trigger)
      .subscribe();
    return () => {
      window.clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [date]);

  // Live driver locations: initial load + realtime subscription.
  useEffect(() => {
    let cancelled = false;
    const loadLocs = async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("driver_id, lat, lng, accuracy, updated_at, drivers(name)");
      if (cancelled) return;
      const rows: DriverLoc[] = (data ?? []).map((r: any) => ({
        driver_id: r.driver_id,
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracy: r.accuracy != null ? Number(r.accuracy) : null,
        updated_at: r.updated_at,
        driver_name: r.drivers?.name ?? null,
      }));
      setDriverLocs(rows);
    };
    void loadLocs();
    const channel = supabase
      .channel("driver-locations")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, () => {
        void loadLocs();
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  // Init map (Carto Positron — clean, only roads + outlines)
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
      center: [7.207495, 51.492174], // Default depot (Bochum) — overridden by data when loaded
      zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    // Close hover popup when clicking elsewhere on the map
    map.on("click", () => {
      pinnedRef.current = false;
      popupRef.current?.remove();
    });

    // As soon as we know the actual default depot, recenter
    supabase.from("depots").select("lat, lng").eq("active", true).eq("is_default", true).maybeSingle()
      .then(({ data }) => {
        if (!mapRef.current || !data?.lat || !data?.lng) return;
        mapRef.current.jumpTo({ center: [Number(data.lng), Number(data.lat)], zoom: 12 });
      });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /** Show a small popup near a marker. Returns the popup so callers can pin it. */
  const showPopup = (lngLat: [number, number], html: string) => {
    const map = mapRef.current;
    if (!map) return null;
    if (popupRef.current) popupRef.current.remove();
    const p = new maplibregl.Popup({
      offset: 16,
      closeButton: false,
      closeOnClick: false,
      className: "ovr-hover-popup",
    })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
    popupRef.current = p;
    return p;
  };

  const hidePopupIfNotPinned = () => {
    if (pinnedRef.current) return;
    popupRef.current?.remove();
    popupRef.current = null;
  };

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Render layers + markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // Clear previous markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Clear previous route layers/sources
      const style = map.getStyle();
      (style.layers ?? []).forEach((l) => {
        if (l.id.startsWith("ovr-line-")) map.removeLayer(l.id);
      });
      Object.keys(style.sources ?? {}).forEach((s) => {
        if (s.startsWith("ovr-route-")) map.removeSource(s);
      });

      const bounds = new maplibregl.LngLatBounds();
      let hasPoint = false;

      // Depots (always visible, neutral)
      depots.forEach((dp) => {
        if (dp.lat == null || dp.lng == null) return;
        const el = document.createElement("div");
        el.className = "flex h-6 w-6 items-center justify-center rounded-sm bg-foreground text-background text-[10px] font-bold border-2 border-background shadow";
        el.style.width = "24px";
        el.style.height = "24px";
        el.textContent = dp.is_default ? "★" : "D";
        el.title = dp.name;
        const m = new maplibregl.Marker({ element: el }).setLngLat([Number(dp.lng), Number(dp.lat)]).addTo(map);
        markersRef.current.push(m);
        bounds.extend([Number(dp.lng), Number(dp.lat)]);
        hasPoint = true;
      });

      routes.forEach((r) => {
        if (hidden.has(r.id)) return;
        const color = colorByRoute[r.id];
        const dimmed = highlightRouteId != null && r.id !== highlightRouteId;

        // Route line
        if (r.geometry) {
          const srcId = `ovr-route-${r.id}`;
          const layerId = `ovr-line-${r.id}`;
          map.addSource(srcId, { type: "geojson", data: { type: "Feature", properties: {}, geometry: r.geometry } });
          map.addLayer({
            id: layerId, type: "line", source: srcId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": color, "line-width": dimmed ? 3 : 5, "line-opacity": dimmed ? 0.25 : 0.9 },
          });
        }

        // Stops
        const routeStops = stops.filter((s) => s.route_id === r.id && s.orders?.lat != null && s.orders?.lng != null);
        routeStops.forEach((s, idx) => {
          const o = s.orders!;
          const done = s.status === "erledigt";
          const skip = s.status === "uebersprungen";
          const stopStatusLabel = done ? "Erledigt" : skip ? "Übersprungen" : "Offen";
          const el = document.createElement("div");
          el.className = "flex h-6 w-6 items-center justify-center rounded-full text-white text-[10px] font-bold border-2 border-white shadow cursor-pointer";
          el.style.width = "24px";
          el.style.height = "24px";
          el.style.backgroundColor = done ? "hsl(142 71% 35%)" : skip ? "hsl(38 92% 45%)" : color;
          if (done) el.style.opacity = "0.7";
          if (dimmed) el.style.opacity = "0.35";
          el.textContent = String(idx + 1);
          const m = new maplibregl.Marker({ element: el })
            .setLngLat([Number(o.lng), Number(o.lat)])
            .addTo(map);
          const stopHtml = `
            <div style="font-family: inherit; min-width: 180px;">
              <div style="font-size: 10px; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(r.name)} · #${idx + 1}</div>
              <div style="font-weight: 600; margin-top: 2px;">${escapeHtml(o.auftrags_nr)}</div>
              <div style="margin-top: 2px;">${escapeHtml(o.empfaenger_name)}</div>
              ${o.empfaenger_adresse ? `<div style="font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 2px;">${escapeHtml(o.empfaenger_adresse)}${o.empfaenger_plz || o.empfaenger_stadt ? `, ${escapeHtml(`${o.empfaenger_plz ?? ""} ${o.empfaenger_stadt ?? ""}`.trim())}` : ""}</div>` : ""}
              <div style="display: inline-block; margin-top: 6px; padding: 1px 6px; border-radius: 4px; font-size: 10px; background: hsl(var(--muted)); color: hsl(var(--muted-foreground));">${stopStatusLabel}</div>
            </div>`;
          el.addEventListener("mouseenter", () => { showPopup([Number(o.lng), Number(o.lat)], stopHtml); });
          el.addEventListener("mouseleave", () => { hidePopupIfNotPinned(); });
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            pinnedRef.current = true;
            showPopup([Number(o.lng), Number(o.lat)], stopHtml);
          });
          el.addEventListener("dblclick", (e) => { e.stopPropagation(); onSelectRoute?.(r.id); });
          markersRef.current.push(m);
          bounds.extend([Number(o.lng), Number(o.lat)]);
          hasPoint = true;
        });
      });

      // New orders (status = "neu") — only when parent passes them in
      newOrders.forEach((o) => {
        if (o.lat == null || o.lng == null) return;
        const isSel = selectedNewOrderIds?.has(o.id);
        const fill = isSel ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
        const stroke = "hsl(var(--background))";
        const size = isSel ? 32 : 26;
        const el = document.createElement("div");
        el.style.cursor = "pointer";
        el.style.transformOrigin = "center bottom";
        el.style.filter = isSel
          ? "drop-shadow(0 3px 5px hsl(var(--primary) / 0.45))"
          : "drop-shadow(0 2px 3px rgba(0,0,0,0.25))";
        // Classic teardrop map pin (anchor: bottom tip)
        el.innerHTML = `
          <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 1.5c-4.42 0-8 3.58-8 8 0 5.5 8 13 8 13s8-7.5 8-13c0-4.42-3.58-8-8-8z"
                  fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>
            <circle cx="12" cy="9.5" r="3" fill="${stroke}"/>
          </svg>`;
        const m = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([Number(o.lng), Number(o.lat)])
          .addTo(map);
        const newHtml = `
          <div style="font-family: inherit; min-width: 180px;">
            <div style="font-size: 10px; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: 0.04em;">Neue Sendung</div>
            <div style="font-weight: 600; margin-top: 2px;">${escapeHtml(o.auftrags_nr)}</div>
            <div style="margin-top: 2px;">${escapeHtml(o.empfaenger_name)}</div>
            <div style="font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 2px;">${o.empfaenger_adresse ? `${escapeHtml(o.empfaenger_adresse)}, ` : ""}${escapeHtml(`${o.empfaenger_plz ?? ""} ${o.empfaenger_stadt}`.trim())}</div>
            <div style="display: inline-block; margin-top: 6px; padding: 1px 6px; border-radius: 4px; font-size: 10px; background: hsl(var(--primary) / 0.15); color: hsl(var(--primary));">Neu</div>
          </div>`;
        el.addEventListener("mouseenter", () => { showPopup([Number(o.lng), Number(o.lat)], newHtml); });
        el.addEventListener("mouseleave", () => { hidePopupIfNotPinned(); });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          pinnedRef.current = true;
          showPopup([Number(o.lng), Number(o.lat)], newHtml);
          onNewOrderClick?.(o.id);
        });
        markersRef.current.push(m);
        bounds.extend([Number(o.lng), Number(o.lat)]);
        hasPoint = true;
      });

      // Live driver positions – nur anzeigen wenn jünger als 300 Minuten.
      const STALE_HIDE_MS = 300 * 60_000;
      const STALE_LABEL_MS = 5 * 60_000;
      driverLocs.forEach((dl) => {
        const ageMs = Date.now() - new Date(dl.updated_at).getTime();
        if (ageMs > STALE_HIDE_MS) return;
        const stale = ageMs > STALE_LABEL_MS;
        const el = document.createElement("div");
        el.style.cursor = "pointer";
        el.style.position = "relative";
        el.style.width = "32px";
        el.style.height = "32px";
        const color = stale ? "hsl(var(--muted-foreground))" : "hsl(142 71% 42%)";
        el.innerHTML = `
          <span style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:0.25;${stale ? "" : "animation: ovr-ping 1.8s ease-out infinite;"}"></span>
          <span style="position:absolute;inset:6px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:700;">🚚</span>`;
        const m = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([dl.lng, dl.lat])
          .addTo(map);
        const ageMin = Math.round(ageMs / 60000);
        const ageLabel =
          ageMin < 1 ? "<1 Min." :
          ageMin < 60 ? `${ageMin} Min.` :
          ageMin < 60 * 24 ? `${Math.round(ageMin / 60)} Std.` :
          `${Math.round(ageMin / (60 * 24))} Tg.`;
        const html = `
          <div style="font-family: inherit; min-width: 180px;">
            <div style="font-size: 10px; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: 0.04em;">Fahrer-Standort</div>
            <div style="font-weight: 600; margin-top: 2px;">${escapeHtml(dl.driver_name ?? "Fahrer")}</div>
            <div style="font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 2px;">
              Aktualisiert vor ${ageLabel}${dl.accuracy != null ? ` · ±${Math.round(dl.accuracy)} m` : ""}
            </div>
            ${stale ? `<div style="display:inline-block;margin-top:6px;padding:1px 6px;border-radius:4px;font-size:10px;background:hsl(var(--muted));color:hsl(var(--muted-foreground));">veraltet</div>` : ""}
          </div>`;
        el.addEventListener("mouseenter", () => { showPopup([dl.lng, dl.lat], html); });
        el.addEventListener("mouseleave", () => { hidePopupIfNotPinned(); });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          pinnedRef.current = true;
          showPopup([dl.lng, dl.lat], html);
        });
        markersRef.current.push(m);
        bounds.extend([dl.lng, dl.lat]);
        hasPoint = true;
      });

      const defaultDepot = depots.find((d) => d.is_default && d.lat != null && d.lng != null)
        ?? depots.find((d) => d.lat != null && d.lng != null);
      const hasRouteContent = routes.some((r) => !hidden.has(r.id) && (r.geometry || stops.some((s) => s.route_id === r.id && s.orders?.lat != null)));

      const hasNewOrderPins = newOrders.some((o) => o.lat != null && o.lng != null);
      if ((hasRouteContent || hasNewOrderPins) && hasPoint) {
        try { map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 600 }); } catch { /* noop */ }
      } else if (defaultDepot) {
        // No routes for this date → center on the default depot
        map.flyTo({ center: [Number(defaultDepot.lng), Number(defaultDepot.lat)], zoom: 12, duration: 600 });
      }
    };
    if (map.loaded()) apply();
    else map.once("load", apply);
  }, [routes, stops, depots, hidden, colorByRoute, onSelectRoute, highlightRouteId, newOrders, selectedNewOrderIds, onNewOrderClick, driverLocs]);

  const toggleHidden = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const stopsByRoute = useMemo(() => {
    const m: Record<string, number> = {};
    stops.forEach((s) => { m[s.route_id] = (m[s.route_id] ?? 0) + 1; });
    return m;
  }, [stops]);

  if (mapOnly) {
    return (
      <Card className="overflow-hidden border-border/60 shadow-card h-full">
        <CardContent className="p-0 h-full">
          <div ref={containerRef} className="h-full w-full min-h-[300px]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
      {/* Sidebar: date + legend */}
      <Card className="h-fit border-border/60 shadow-card">
        <CardContent className="p-3 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-caption font-medium text-muted-foreground uppercase tracking-wide">Datum</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 text-body"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-caption font-medium text-muted-foreground uppercase tracking-wide">
                Routen
              </span>
              <span className="text-caption tabular-nums text-muted-foreground">
                {routes.length}
              </span>
            </div>
            <ScrollArea className="h-[55vh] -mr-2 pr-2">
              {loading ? (
                <div className="px-2 py-6 text-caption text-muted-foreground">Lade…</div>
              ) : routes.length === 0 ? (
                <div className="px-2 py-6 text-caption text-muted-foreground">
                  Keine Routen für dieses Datum.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {routes.map((r) => {
                    const isHidden = hidden.has(r.id);
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors duration-fast ease-fast-out",
                          "hover:bg-surface-muted",
                          isHidden && "opacity-50",
                        )}
                      >
                        <Checkbox
                          checked={!isHidden}
                          onCheckedChange={() => toggleHidden(r.id)}
                          className="shrink-0"
                        />
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-background"
                          style={{ backgroundColor: colorByRoute[r.id] }}
                        />
                        <button
                          onClick={() => onSelectRoute?.(r.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[r.status])} />
                            <span className="truncate text-body font-medium leading-tight">
                              {r.name}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-caption text-muted-foreground">
                            <span className="tabular-nums">{stopsByRoute[r.id] ?? 0}</span> Stops
                            {r.drivers?.name && <> · {r.drivers.name}</>}
                            {r.vehicles?.kennzeichen && <> · {r.vehicles.kennzeichen}</>}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="border-t border-border/50 pt-2.5 space-y-1 text-caption text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-foreground text-background text-[9px] font-bold">★</span>
              <span>Standard-Depot</span>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-foreground text-background text-[9px] font-bold ml-2">D</span>
              <span>Depot</span>
            </div>
            <div>Doppelklick auf Stop → Route öffnen</div>
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      <Card className="overflow-hidden border-border/60 shadow-card">
        <CardContent className="p-0">
          <div ref={containerRef} className="h-[78vh] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}