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

interface Driver { id: string; name: string; }
interface Vehicle { id: string; kennzeichen: string; }
interface Route {
  id: string;
  name: string;
  driver_id: string | null;
  vehicle_id: string | null;
  datum: string;
  status: "geplant" | "aktiv" | "abgeschlossen";
  notizen: string | null;
  drivers?: Driver | null;
  vehicles?: Vehicle | null;
}

const statusLabels: Record<string, string> = { geplant: "Geplant", aktiv: "Aktiv", abgeschlossen: "Abgeschlossen" };
const statusVariant: Record<string, "default" | "secondary" | "outline"> = { geplant: "secondary", aktiv: "default", abgeschlossen: "outline" };
const emptyForm = { name: "", driver_id: "", vehicle_id: "", datum: new Date().toISOString().slice(0, 10), status: "geplant" as Route["status"], notizen: "" };

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

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name ist erforderlich"); return; }
    const payload = {
      name: form.name,
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      datum: form.datum,
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
      if (data) setSearchParams({ route: (data as Route).id });
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
    setForm({ name: r.name, driver_id: r.driver_id ?? "", vehicle_id: r.vehicle_id ?? "", datum: r.datum, status: r.status, notizen: r.notizen ?? "" });
    setOpen(true);
  };

  const selectRoute = (id: string) => setSearchParams({ route: id });

  return (
    <AdminLayout title="Routenplanung">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* LEFT: Routes list */}
        <Card className="h-fit">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="text-sm text-muted-foreground">{routes.length} Routen</div>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Neu</Button>
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
          <ScrollArea className="h-[75vh]">
            <CardContent className="p-2 space-y-1">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">Lade...</div>
              ) : routes.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Keine Routen. Erstelle eine neue.</div>
              ) : routes.map((r) => {
                const active = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    onClick={() => selectRoute(r.id)}
                    className={`w-full rounded-md border p-2 text-left transition hover:bg-accent ${active ? "border-primary bg-accent" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div className="truncate text-sm font-medium">{r.name}</div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground truncate">
                          {new Date(r.datum).toLocaleDateString("de-DE")}
                          {r.drivers?.name && ` · ${r.drivers.name}`}
                          {r.vehicles?.kennzeichen && ` · ${r.vehicles.kennzeichen}`}
                        </div>
                      </div>
                      <Badge variant={statusVariant[r.status]} className="shrink-0 text-[10px]">{statusLabels[r.status]}</Badge>
                    </div>
                    {active && (
                      <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
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
                  </button>
                );
              })}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* RIGHT: Builder */}
        <div>
          {selectedId ? (
            <RouteBuilder key={selectedId} routeId={selectedId} />
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <MapPin className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p>Wähle links eine Route aus oder erstelle eine neue.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default RoutenplanungPage;
