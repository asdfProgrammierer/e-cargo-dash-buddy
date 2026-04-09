import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, MapPin, Pencil, Trash2 } from "lucide-react";

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
  const [routes, setRoutes] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const [r, d, v] = await Promise.all([
      supabase.from("routes").select("*, drivers(id,name), vehicles(id,kennzeichen)").order("datum", { ascending: false }),
      supabase.from("drivers").select("id, name").eq("status", "aktiv"),
      supabase.from("vehicles").select("id, kennzeichen").eq("status", "verfuegbar"),
    ]);
    setRoutes((r.data as Route[]) ?? []);
    setDrivers((d.data as Driver[]) ?? []);
    setVehicles((v.data as Vehicle[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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
      const { error } = await supabase.from("routes").insert(payload);
      if (error) { toast.error("Fehler beim Erstellen"); return; }
      toast.success("Route erstellt");
    }
    setOpen(false); setEditId(null); setForm(emptyForm); load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("routes").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Route gelöscht"); load();
  };

  const openEdit = (r: Route) => {
    setEditId(r.id);
    setForm({ name: r.name, driver_id: r.driver_id ?? "", vehicle_id: r.vehicle_id ?? "", datum: r.datum, status: r.status, notizen: r.notizen ?? "" });
    setOpen(true);
  };

  return (
    <AdminLayout title="Routenplanung">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground text-sm">{routes.length} Routen</p>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />Route erstellen</Button>
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
                      <SelectContent>
                        {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fahrzeug</Label>
                    <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Auswählen" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.kennzeichen}</SelectItem>)}
                      </SelectContent>
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

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Fahrer</TableHead>
                <TableHead>Fahrzeug</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Lade...</TableCell></TableRow>
              ) : routes.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Keine Routen vorhanden</TableCell></TableRow>
              ) : routes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{r.name}</div></TableCell>
                  <TableCell>{r.drivers?.name ?? "–"}</TableCell>
                  <TableCell>{r.vehicles?.kennzeichen ?? "–"}</TableCell>
                  <TableCell>{new Date(r.datum).toLocaleDateString("de-DE")}</TableCell>
                  <TableCell><Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default RoutenplanungPage;
