import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, MapPin, Pencil, Trash2, ExternalLink, Printer } from "lucide-react";
import { RouteBuilder } from "@/components/admin/RouteBuilder";
import { RoutesOverviewMap } from "@/components/admin/RoutesOverviewMap";
import { NewOrdersTable, type NewOrderRow } from "@/components/admin/NewOrdersTable";
import { Switch } from "@/components/ui/switch";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Driver { id: string; name: string; }
interface Vehicle { id: string; kennzeichen: string; }
interface Depot { id: string; name: string; is_default: boolean; }
interface Route {
  id: string;
  name: string;
  driver_id: string | null;
  vehicle_id: string | null;
  datum: string;
  start_time: string;
  status: "geplant" | "aktiv" | "abgeschlossen";
  notizen: string | null;
  start_depot_id: string | null;
  end_depot_id: string | null;
  drivers?: Driver | null;
  vehicles?: Vehicle | null;
}

const statusLabels: Record<string, string> = { geplant: "Geplant", aktiv: "Aktiv", abgeschlossen: "Abgeschlossen" };
const statusVariant: Record<string, "default" | "secondary" | "outline"> = { geplant: "secondary", aktiv: "default", abgeschlossen: "outline" };
const emptyForm = { name: "", driver_id: "", vehicle_id: "", start_depot_id: "", end_depot_id: "", datum: new Date().toISOString().slice(0, 10), start_time: "09:00", status: "geplant" as Route["status"], notizen: "" };

const RoutenplanungPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [refreshKey, setRefreshKey] = useState(0);

  // Lifted "new orders" state shared between map + table
  const [newOrders, setNewOrders] = useState<NewOrderRow[]>([]);
  const [newOrdersLoading, setNewOrdersLoading] = useState(true);
  const [selectedNewOrders, setSelectedNewOrders] = useState<Set<string>>(new Set());
  const [showNewOnMap, setShowNewOnMap] = useState(false);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [hiddenRoutes, setHiddenRoutes] = useState<Set<string>>(new Set());
  // When creating a new route from "Zur Route", remember the selected ids
  // so we can auto-assign them after the route is saved.
  const [pendingAssignIds, setPendingAssignIds] = useState<string[] | null>(null);

  // Print dialog state: pick one of the planned/active routes for the day
  const [printOpen, setPrintOpen] = useState(false);
  const [printRouteId, setPrintRouteId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const selectedId = searchParams.get("route");

  const load = async () => {
    const [r, d, v, dep] = await Promise.all([
      supabase.from("routes").select("*, drivers(id,name), vehicles(id,kennzeichen)").order("datum", { ascending: false }),
      supabase.from("drivers").select("id, name").eq("status", "aktiv"),
      supabase.from("vehicles").select("id, kennzeichen").eq("status", "verfuegbar"),
      supabase.from("depots").select("id, name, is_default").eq("active", true).order("name"),
    ]);
    const list = (r.data as Route[]) ?? [];
    setRoutes(list);
    setDrivers((d.data as Driver[]) ?? []);
    setVehicles((v.data as Vehicle[]) ?? []);
    setDepots((dep.data as Depot[]) ?? []);
    setLoading(false);
    // auto-select first if none selected
    if (!selectedId && list.length > 0) {
      setSearchParams({ route: list[0].id }, { replace: true });
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const loadNewOrders = async () => {
    setNewOrdersLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, pakete, gewicht, lat, lng, created_at")
      .eq("status", "neu")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { toast.error("Bestellungen konnten nicht geladen werden"); setNewOrdersLoading(false); return; }
    setNewOrders((data as NewOrderRow[]) ?? []);
    setSelectedNewOrders(new Set());
    setNewOrdersLoading(false);
  };

  useEffect(() => { loadNewOrders(); }, [refreshKey]);

  const handleNewOrderPinClick = (id: string) => {
    setFocusedOrderId(id);
    setSelectedNewOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name ist erforderlich"); return; }
    const defaultDepot = depots.find((x) => x.is_default)?.id ?? depots[0]?.id ?? null;
    const startDepot = form.start_depot_id || defaultDepot;
    const endDepot = form.end_depot_id || startDepot;
    const payload = {
      name: form.name,
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      datum: form.datum,
      start_time: form.start_time || "09:00",
      status: form.status,
      notizen: form.notizen || null,
      start_depot_id: startDepot,
      end_depot_id: endDepot,
    };
    if (editId) {
      const { error } = await supabase.from("routes").update(payload).eq("id", editId);
      if (error) { toast.error("Fehler beim Speichern"); return; }
      toast.success("Route aktualisiert");
    } else {
      const { data, error } = await supabase.from("routes").insert(payload).select().single();
      if (error) { toast.error("Fehler beim Erstellen"); return; }
      toast.success("Route erstellt");
      const newRoute = data as Route | null;
      if (newRoute) {
        setSearchParams({ route: newRoute.id });
        // If user came from "Zur Route → Neue Route erstellen", assign selected orders now.
        if (pendingAssignIds && pendingAssignIds.length > 0) {
          const rows = pendingAssignIds.map((order_id, i) => ({
            route_id: newRoute.id, order_id, position: i + 1,
          }));
          const { error: assignErr } = await supabase.from("route_stops").insert(rows);
          if (assignErr) {
            toast.error("Stops konnten nicht hinzugefügt werden");
          } else {
            await supabase.from("orders").update({ status: "in_bearbeitung" }).in("id", pendingAssignIds);
            toast.success(`${pendingAssignIds.length} Sendung(en) zur neuen Route hinzugefügt`);
            setSelectedNewOrders(new Set());
            bumpRefresh();
          }
          setPendingAssignIds(null);
        }
      }
    }
    setOpen(false); setEditId(null); setForm(emptyForm); load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("routes").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Route gelöscht");
    if (selectedId === id) setSearchParams({}, { replace: true });
    load();
  };

  const openEdit = (r: Route) => {
    setEditId(r.id);
    setForm({
      name: r.name,
      driver_id: r.driver_id ?? "",
      vehicle_id: r.vehicle_id ?? "",
      start_depot_id: r.start_depot_id ?? "",
      end_depot_id: r.end_depot_id ?? "",
      datum: r.datum,
      start_time: (r.start_time ?? "09:00").slice(0, 5),
      status: r.status,
      notizen: r.notizen ?? "",
    });
    setOpen(true);
  };

  const selectRoute = (id: string) => setSearchParams({ route: id });

  const routesForDate = routes.filter((r) => r.datum === date);
  const printableRoutes = routesForDate.filter((r) => r.status === "geplant" || r.status === "aktiv");

  const generateRoutePdf = async (routeId: string) => {
    setPrinting(true);
    try {
      const route = routes.find((r) => r.id === routeId);
      if (!route) throw new Error("Route nicht gefunden");

      const { data: stops, error } = await supabase
        .from("route_stops")
        .select("position, orders(auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_telefon, pakete, profiles!orders_user_id_fkey(firma_name, ansprechpartner))")
        .eq("route_id", routeId)
        .order("position", { ascending: true });
      if (error) throw error;

      const rows = (stops ?? []).map((s: any) => {
        const o = s.orders ?? {};
        const merchant = o.profiles?.firma_name || o.profiles?.ansprechpartner || "–";
        const addr = [o.empfaenger_adresse, [o.empfaenger_plz, o.empfaenger_stadt].filter(Boolean).join(" ")]
          .filter(Boolean).join(", ");
        return [
          String(s.position),
          o.empfaenger_name ?? "–",
          addr || "–",
          merchant,
          o.empfaenger_telefon ?? "",
          String(o.pakete ?? 1),
        ];
      });

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const dateStr = new Date(route.datum).toLocaleDateString("de-DE");
      doc.setFontSize(16);
      doc.text(`Route: ${route.name}`, 14, 16);
      doc.setFontSize(10);
      doc.setTextColor(90);
      const meta = [
        `Datum: ${dateStr}`,
        `Start: ${route.start_time?.slice(0, 5) ?? "–"}`,
        `Fahrer: ${route.drivers?.name ?? "–"}`,
        `Fahrzeug: ${route.vehicles?.kennzeichen ?? "–"}`,
        `Stops: ${rows.length}`,
      ].join("   ·   ");
      doc.text(meta, 14, 22);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 28,
        head: [["#", "Empfänger", "Adresse", "Händler", "Telefon", "Pakete"]],
        body: rows,
        styles: { fontSize: 9, cellPadding: 2, valign: "top" },
        headStyles: { fillColor: [34, 139, 87] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 38 },
          2: { cellWidth: 60 },
          3: { cellWidth: 38 },
          4: { cellWidth: 24 },
          5: { cellWidth: 14, halign: "center" },
        },
        didDrawPage: (data) => {
          const pageCount = doc.getNumberOfPages();
          const page = data.pageNumber;
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(
            `e-cargo · ${route.name} · ${dateStr} · Seite ${page}/${pageCount}`,
            14,
            doc.internal.pageSize.getHeight() - 8,
          );
          doc.setTextColor(0);
        },
      });

      const safeName = route.name.replace(/[^a-z0-9-_]+/gi, "_");
      doc.save(`Route_${safeName}_${route.datum}.pdf`);
      toast.success("PDF erstellt");
      setPrintOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "PDF konnte nicht erstellt werden");
    } finally {
      setPrinting(false);
    }
  };

  // When the date changes, drop a selected route that doesn't belong to the new day
  useEffect(() => {
    if (!selectedId) return;
    if (!routesForDate.some((r) => r.id === selectedId)) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, routes]);

  const toggleRouteHidden = (id: string) => {
    setHiddenRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <AdminLayout title="Routenplanung">
      <div className="flex h-[calc(100vh-3.5rem-3rem)] flex-col gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Label className="text-caption text-muted-foreground">Datum</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-40 text-caption"
          />
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {routesForDate.length} Routen
          </Badge>
        </div>
        <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setPrintRouteId(printableRoutes.length > 0 ? (selectedId && printableRoutes.some((r) => r.id === selectedId) ? selectedId : printableRoutes[0].id) : null);
            setPrintOpen(true);
          }}
          disabled={printableRoutes.length === 0}
          title={printableRoutes.length === 0 ? "Keine geplanten/aktiven Routen für dieses Datum" : "Route als PDF drucken"}
        >
          <Printer className="mr-1 h-4 w-4" />Drucken
        </Button>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm({ ...emptyForm, datum: date }); setPendingAssignIds(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setForm({ ...emptyForm, datum: date })}>
              <Plus className="mr-1 h-4 w-4" />Neue Route
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Route bearbeiten" : "Neue Route"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Dortmund-Innenstadt" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fahrer</Label>
                  <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Auswählen" /></SelectTrigger>
                    <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fahrzeug</Label>
                  <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Auswählen" /></SelectTrigger>
                    <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.kennzeichen}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start-Ort</Label>
                  <Select value={form.start_depot_id} onValueChange={(v) => setForm({ ...form, start_depot_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Depot wählen" /></SelectTrigger>
                    <SelectContent>{depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.is_default ? " ★" : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ziel-Ort</Label>
                  <Select value={form.end_depot_id} onValueChange={(v) => setForm({ ...form, end_depot_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Depot wählen" /></SelectTrigger>
                    <SelectContent>{depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.is_default ? " ★" : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Datum</Label><Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></div>
                <div>
                  <Label>Startzeit</Label>
                  <div className="flex gap-2">
                    <Select
                      value={(form.start_time || "09:00").split(":")[0]}
                      onValueChange={(h) => {
                        const m = (form.start_time || "09:00").split(":")[1] ?? "00";
                        setForm({ ...form, start_time: `${h}:${m}` });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={(form.start_time || "09:00").split(":")[1] ?? "00"}
                      onValueChange={(m) => {
                        const h = (form.start_time || "09:00").split(":")[0];
                        setForm({ ...form, start_time: `${h}:${m}` });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["00", "15", "30", "45"].map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Route["status"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geplant">Geplant</SelectItem>
                      <SelectItem value="aktiv">Aktiv</SelectItem>
                      <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Notizen</Label><Input value={form.notizen} onChange={(e) => setForm({ ...form, notizen: e.target.value })} /></div>
              <Button className="w-full" onClick={handleSave}>{editId ? "Speichern" : "Erstellen"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Print route picker */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Route drucken</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-caption text-muted-foreground">
              Wähle eine geplante oder aktive Route. Es öffnet sich eine druckfertige PDF-Ansicht mit allen Stops in Reihenfolge für den Fahrer.
            </p>
            {printableRoutes.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-caption text-muted-foreground">
                Keine geplanten oder aktiven Routen für dieses Datum.
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-caption">Route</Label>
                  <Select value={printRouteId ?? ""} onValueChange={(v) => setPrintRouteId(v)}>
                    <SelectTrigger><SelectValue placeholder="Route auswählen" /></SelectTrigger>
                    <SelectContent>
                      {printableRoutes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} · {statusLabels[r.status]}
                          {r.drivers?.name ? ` · ${r.drivers.name}` : ""}
                          {r.vehicles?.kennzeichen ? ` · ${r.vehicles.kennzeichen}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={!printRouteId || printing}
                  onClick={() => printRouteId && generateRoutePdf(printRouteId)}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {printing ? "Erstelle PDF..." : "PDF herunterladen"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 4-Quadrant Layout: Left (Routes + Stops) | Right (Map + New Orders) */}
      <div className="grid grid-cols-1 lg:grid-cols-[520px_1fr] gap-3 flex-1 min-h-0 overflow-hidden">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Routes (top) */}
          <Card className="shadow-card flex flex-col min-h-0 overflow-hidden" style={{ flex: "0 0 auto", maxHeight: "30%" }}>
            <div className="flex items-center justify-between px-4 h-10 border-b border-border/50">
              <span className="text-body font-medium">Routen</span>
              <span className="text-caption tabular-nums text-muted-foreground">{routesForDate.length}</span>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4 text-caption text-muted-foreground">Lade…</div>
                ) : routesForDate.length === 0 ? (
                  <div className="p-6 text-center text-caption text-muted-foreground">
                    Keine Routen für dieses Datum.
                  </div>
                ) : routesForDate.map((r) => {
                  const active = r.id === selectedId;
                  const isHidden = hiddenRoutes.has(r.id);
                  return (
                    <div
                      key={r.id}
                      className={`w-full px-3 py-2 border-b border-border/50 transition-colors duration-fast ease-fast-out hover:bg-surface-muted ${active ? "bg-active-surface" : ""} ${isHidden ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => selectRoute(r.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                            <div className="truncate text-body font-medium">{r.name}</div>
                          </div>
                          <div className="mt-0.5 text-caption text-muted-foreground tabular-nums truncate">
                            {r.drivers?.name ?? "–"}
                            {r.vehicles?.kennzeichen && ` · ${r.vehicles.kennzeichen}`}
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={statusVariant[r.status]} className="text-[10px]">{statusLabels[r.status]}</Badge>
                          <Switch
                            checked={!isHidden}
                            onCheckedChange={() => toggleRouteHidden(r.id)}
                            title={isHidden ? "Auf Karte anzeigen" : "Auf Karte ausblenden"}
                          />
                        </div>
                      </div>
                      {active && (
                        <div className="mt-1.5 flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Bearbeiten">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/admin/routen/${r.id}`)} title="Vollansicht">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(r.id)} title="Löschen">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </ScrollArea>
          </Card>

          {/* Stops of selected route (bottom) */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {selectedId ? (
              <RouteBuilder key={selectedId + ":" + refreshKey} routeId={selectedId} compact />
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-caption text-muted-foreground">
                  <MapPin className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Wähle oben eine Route, um die Stops zu sehen.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Map (top, large) */}
          <div className="flex-[2] min-h-0">
            <RoutesOverviewMap
              date={date}
              mapOnly
              highlightRouteId={selectedId}
              refreshKey={refreshKey}
              onSelectRoute={(id) => setSearchParams({ route: id })}
              hidden={hiddenRoutes}
              newOrders={showNewOnMap ? newOrders : []}
              selectedNewOrderIds={selectedNewOrders}
              onNewOrderClick={handleNewOrderPinClick}
            />
          </div>

          {/* New orders table (bottom) */}
          <div className="flex-[1] min-h-0">
            <NewOrdersTable
              routeId={selectedId}
              refreshKey={refreshKey}
              onAssigned={bumpRefresh}
              orders={newOrders}
              loading={newOrdersLoading}
              onReload={loadNewOrders}
              selected={selectedNewOrders}
              setSelected={setSelectedNewOrders}
              showOnMap={showNewOnMap}
              setShowOnMap={setShowNewOnMap}
              focusedOrderId={focusedOrderId}
              routesForDate={routesForDate.map((r) => ({ id: r.id, name: r.name, status: r.status }))}
              onCreateNewRoute={() => {
                setPendingAssignIds(Array.from(selectedNewOrders));
                setEditId(null);
                setForm({ ...emptyForm, datum: date });
                setOpen(true);
              }}
              onSelectRoute={(id) => setSearchParams({ route: id })}
            />
          </div>
        </div>
      </div>
      </div>
    </AdminLayout>
  );
};

export default RoutenplanungPage;
