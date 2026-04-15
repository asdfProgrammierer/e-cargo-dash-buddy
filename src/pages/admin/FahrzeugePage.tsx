import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Plus, Truck, Pencil, Trash2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface Vehicle {
  id: string;
  kennzeichen: string;
  typ: "lastenrad" | "e_van" | "transporter" | "sonstige";
  kapazitaet_kg: number;
  status: "verfuegbar" | "unterwegs" | "in_wartung";
  notizen: string | null;
}

const typLabels: Record<string, string> = { lastenrad: "Lastenrad", e_van: "E-Van", transporter: "Transporter", sonstige: "Sonstige" };
const statusLabels: Record<string, string> = { verfuegbar: "Verfügbar", unterwegs: "Unterwegs", in_wartung: "In Wartung" };
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = { verfuegbar: "default", unterwegs: "secondary", in_wartung: "destructive" };

const emptyForm = { kennzeichen: "", typ: "lastenrad" as Vehicle["typ"], kapazitaet_kg: "0", status: "verfuegbar" as Vehicle["status"], notizen: "" };

const FahrzeugePage = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [lastInspections, setLastInspections] = useState<Record<string, string>>({});
  const [nextTuev, setNextTuev] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const { data } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    setVehicles((data as Vehicle[]) ?? []);

    // Fetch latest inspection date per vehicle
    const { data: inspections } = await supabase
      .from("vehicle_inspections")
      .select("vehicle_id, inspection_date")
      .order("inspection_date", { ascending: false });

    const map: Record<string, string> = {};
    if (inspections) {
      for (const i of inspections as any[]) {
        if (!map[i.vehicle_id]) map[i.vehicle_id] = i.inspection_date;
      }
    }
    setLastInspections(map);

    // Fetch next TÜV date per vehicle (nearest future or latest tuev entry)
    const { data: tuevData } = await supabase
      .from("maintenance_schedule")
      .select("vehicle_id, faellig_am, status")
      .eq("typ", "tuev")
      .order("faellig_am", { ascending: true });

    const tuevMap: Record<string, string> = {};
    if (tuevData) {
      for (const t of tuevData as any[]) {
        if (!tuevMap[t.vehicle_id] || (t.status !== "erledigt" && !tuevMap[t.vehicle_id])) {
          // Prefer the next non-erledigt entry
          if (t.status !== "erledigt") tuevMap[t.vehicle_id] = t.faellig_am;
          else if (!tuevMap[t.vehicle_id]) tuevMap[t.vehicle_id] = t.faellig_am;
        }
      }
    }
    setNextTuev(tuevMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.kennzeichen.trim()) { toast.error("Kennzeichen ist erforderlich"); return; }
    const payload = { kennzeichen: form.kennzeichen, typ: form.typ, kapazitaet_kg: Number(form.kapazitaet_kg) || 0, status: form.status, notizen: form.notizen || null };

    if (editId) {
      const { error } = await supabase.from("vehicles").update(payload).eq("id", editId);
      if (error) { toast.error("Fehler beim Speichern"); return; }
      toast.success("Fahrzeug aktualisiert");
    } else {
      const { error } = await supabase.from("vehicles").insert(payload);
      if (error) { toast.error("Fehler beim Erstellen"); return; }
      toast.success("Fahrzeug hinzugefügt");
    }
    setOpen(false); setEditId(null); setForm(emptyForm); load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Fahrzeug gelöscht"); load();
  };

  const openEdit = (v: Vehicle) => {
    setEditId(v.id);
    setForm({ kennzeichen: v.kennzeichen, typ: v.typ, kapazitaet_kg: String(v.kapazitaet_kg), status: v.status, notizen: v.notizen ?? "" });
    setOpen(true);
  };

  return (
    <AdminLayout title="Fahrzeugverwaltung">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground text-sm">{vehicles.length} Fahrzeuge</p>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />Fahrzeug hinzufügen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Fahrzeug bearbeiten" : "Neues Fahrzeug"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Kennzeichen *</Label><Input value={form.kennzeichen} onChange={(e) => setForm({ ...form, kennzeichen: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Typ</Label>
                    <Select value={form.typ} onValueChange={(v) => setForm({ ...form, typ: v as Vehicle["typ"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lastenrad">Lastenrad</SelectItem>
                        <SelectItem value="e_van">E-Van</SelectItem>
                        <SelectItem value="transporter">Transporter</SelectItem>
                        <SelectItem value="sonstige">Sonstige</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Kapazität (kg)</Label><Input type="number" value={form.kapazitaet_kg} onChange={(e) => setForm({ ...form, kapazitaet_kg: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Vehicle["status"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verfuegbar">Verfügbar</SelectItem>
                      <SelectItem value="unterwegs">Unterwegs</SelectItem>
                      <SelectItem value="in_wartung">In Wartung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Notizen</Label><Input value={form.notizen} onChange={(e) => setForm({ ...form, notizen: e.target.value })} /></div>
                <Button className="w-full" onClick={handleSave}>{editId ? "Speichern" : "Hinzufügen"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kennzeichen</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Kapazität</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Nächste Kontrolle</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Lade...</TableCell></TableRow>
              ) : vehicles.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Keine Fahrzeuge vorhanden</TableCell></TableRow>
              ) : vehicles.map((v) => {
                const lastDate = lastInspections[v.id];
                let daysUntil: number | null = null;
                let nextDateStr = "";
                if (lastDate) {
                  const next = new Date(lastDate);
                  next.setDate(next.getDate() + 14);
                  daysUntil = Math.ceil((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  nextDateStr = next.toLocaleDateString("de-DE");
                }
                const isOverdue = daysUntil !== null && daysUntil < 0;
                const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 3;

                return (
                  <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/fahrzeuge/${v.id}`)}>
                    <TableCell className="font-medium"><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />{v.kennzeichen}</div></TableCell>
                    <TableCell>{typLabels[v.typ]}</TableCell>
                    <TableCell>{v.kapazitaet_kg} kg</TableCell>
                    <TableCell><Badge variant={statusVariant[v.status]}>{statusLabels[v.status]}</Badge></TableCell>
                    <TableCell>
                      {!lastDate ? (
                        <div className="flex items-center gap-1.5 text-destructive text-sm">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Keine Kontrolle</span>
                        </div>
                      ) : isOverdue ? (
                        <div className="flex items-center gap-1.5 text-destructive text-sm font-medium">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Überfällig ({Math.abs(daysUntil!)} Tage)</span>
                        </div>
                      ) : isDueSoon ? (
                        <div className="flex items-center gap-1.5 text-warning text-sm font-medium">
                          <Clock className="h-4 w-4" />
                          <span>In {daysUntil} {daysUntil === 1 ? "Tag" : "Tagen"} · {nextDateStr}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-success text-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>In {daysUntil} Tagen · {nextDateStr}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default FahrzeugePage;
