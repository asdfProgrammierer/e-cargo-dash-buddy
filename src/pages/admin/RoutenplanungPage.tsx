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
import { Plus, MapPin, Pencil, Trash2, ExternalLink } from "lucide-react";
import { RouteBuilder } from "@/components/admin/RouteBuilder";
import { RoutesOverviewMap } from "@/components/admin/RoutesOverviewMap";
import { NewOrdersTable, type NewOrderRow } from "@/components/admin/NewOrdersTable";
import { Switch } from "@/components/ui/switch";

interface Driver { id: string; name: string; }
interface Vehicle { id: string; kennzeichen: string; }
interface Route {
  id: string;
  name: string;
  driver_id: string | null;
  vehicle_id: string | null;
  datum: string;
  start_time: string;
  status: "geplant" | "aktiv" | "abgeschlossen";
  notizen: string | null;
  drivers?: Driver | null;
  vehicles?: Vehicle | null;
}

const statusLabels: Record<string, string> = { geplant: "Geplant", aktiv: "Aktiv", abgeschlossen: "Abgeschlossen" };
const statusVariant: Record<string, "default" | "secondary" | "outline"> = { geplant: "secondary", aktiv: "default", abgeschlossen: "outline" };
const emptyForm = { name: "", driver_id: "", vehicle_id: "", datum: new Date().toISOString().slice(0, 10), start_time: "09:00", status: "geplant" as Route["status"], notizen: "" };

const RoutenplanungPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
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

  const selectedId = searchParams.get("route");

  const load = async () => {
    const [r, d, v] = await Promise.all([
      supabase.from("routes").select("*, drivers(id,name), vehicles(id,kennzeichen)").order("datum", { ascending: false }),
      supabase.from("drivers").select("id, name").eq("status", "aktiv"),
      supabase.from("vehicles").select("id, kennzeichen").eq("status", "verfuegbar"),
    ]);
    const list = (r.data as Route[]) ?? [];
    setRoutes(list);
    setDrivers((d.data as Driver[]) ?? []);
    setVehicles((v.data as Vehicle[]) ?? []);
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
    const payload = {
      name: form.name,
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      datum: form.datum,
      start_time: form.start_time || "09:00",
      status: form.status,
      notizen: form.notizen || null,
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
    setForm({ name: r.name, driver_id: r.driver_id ?? "", vehicle_id: r.vehicle_id ?? "", datum: r.datum, start_time: (r.start_time ?? "09:00").slice(0, 5), status: r.status, notizen: r.notizen ?? "" });
    setOpen(true);
  };

  const selectRoute = (id: string) => setSearchParams({ route: id });

  const routesForDate = routes.filter((r) => r.datum === date);

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
                <div><Label>Datum</Label><Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></div>
                <div><Label>Startzeit</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
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

      {/* 4-Quadrant Layout: Left (Routes + Stops) | Right (Map + New Orders) */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 flex-1 min-h-0 overflow-hidden">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Routes (top) */}
          <Card className="shadow-card flex flex-col flex-[1] min-h-0 overflow-hidden">
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
          <div className="flex-[2] min-h-0 overflow-hidden">
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
          <div className="flex-[3] min-h-0">
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
          <div className="flex-[2] min-h-0">
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
