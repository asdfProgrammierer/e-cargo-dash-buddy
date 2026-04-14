import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Wrench, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface Maintenance {
  id: string;
  typ: string;
  bezeichnung: string;
  faellig_am: string;
  erledigt_am: string | null;
  status: string;
  kosten: number | null;
  notizen: string | null;
}

const typLabels: Record<string, string> = {
  tuev: "TÜV/HU", inspektion: "Inspektion", reifenwechsel: "Reifenwechsel",
  oelwechsel: "Ölwechsel", bremsen: "Bremsen", batterie: "Batterie", sonstige: "Sonstige",
};
const statusIcons: Record<string, React.ElementType> = { geplant: Clock, faellig: AlertTriangle, ueberfaellig: AlertTriangle, erledigt: CheckCircle2 };
const statusColors: Record<string, string> = { geplant: "secondary", faellig: "outline", ueberfaellig: "destructive", erledigt: "default" };
const statusLabels: Record<string, string> = { geplant: "Geplant", faellig: "Fällig", ueberfaellig: "Überfällig", erledigt: "Erledigt" };

type MaintenanceTyp = "tuev" | "inspektion" | "reifenwechsel" | "oelwechsel" | "bremsen" | "batterie" | "sonstige";
type MaintenanceStatus = "geplant" | "faellig" | "ueberfaellig" | "erledigt";

const emptyForm = {
  typ: "tuev" as MaintenanceTyp,
  bezeichnung: "",
  faellig_am: new Date().toISOString().slice(0, 10),
  erledigt_am: "",
  status: "geplant" as MaintenanceStatus,
  kosten: "",
  notizen: "",
};

export function MaintenanceTab({ vehicleId }: { vehicleId: string }) {
  const [items, setItems] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const { data } = await supabase
      .from("maintenance_schedule")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("faellig_am", { ascending: true });
    setItems((data as Maintenance[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [vehicleId]);

  const handleSave = async () => {
    if (!form.bezeichnung.trim()) { toast.error("Bezeichnung erforderlich"); return; }
    const payload = {
      vehicle_id: vehicleId,
      typ: form.typ,
      bezeichnung: form.bezeichnung,
      faellig_am: form.faellig_am,
      erledigt_am: form.erledigt_am || null,
      status: form.status,
      kosten: form.kosten ? Number(form.kosten) : null,
      notizen: form.notizen || null,
    };
    if (editId) {
      const { error } = await supabase.from("maintenance_schedule").update(payload).eq("id", editId);
      if (error) { toast.error("Fehler"); return; }
      toast.success("Aktualisiert");
    } else {
      const { error } = await supabase.from("maintenance_schedule").insert(payload);
      if (error) { toast.error("Fehler"); return; }
      toast.success("Hinzugefügt");
    }
    setOpen(false); setEditId(null); setForm(emptyForm); load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("maintenance_schedule").delete().eq("id", id);
    toast.success("Gelöscht"); load();
  };

  const openEdit = (m: Maintenance) => {
    setEditId(m.id);
    setForm({
      typ: m.typ as MaintenanceTyp,
      bezeichnung: m.bezeichnung,
      faellig_am: m.faellig_am,
      erledigt_am: m.erledigt_am ?? "",
      status: m.status as MaintenanceStatus,
      kosten: m.kosten ? String(m.kosten) : "",
      notizen: m.notizen ?? "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{items.length} Einträge</p>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />Wartung hinzufügen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Wartung bearbeiten" : "Neue Wartung"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Typ</Label>
                  <Select value={form.typ} onValueChange={(v) => setForm({ ...form, typ: v as MaintenanceTyp })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(typLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as MaintenanceStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Bezeichnung *</Label><Input value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} placeholder="z.B. TÜV Hauptuntersuchung 2026" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Fällig am</Label><Input type="date" value={form.faellig_am} onChange={(e) => setForm({ ...form, faellig_am: e.target.value })} /></div>
                <div><Label>Erledigt am</Label><Input type="date" value={form.erledigt_am} onChange={(e) => setForm({ ...form, erledigt_am: e.target.value })} /></div>
              </div>
              <div><Label>Kosten (€)</Label><Input type="number" value={form.kosten} onChange={(e) => setForm({ ...form, kosten: e.target.value })} /></div>
              <div><Label>Notizen</Label><Textarea value={form.notizen} onChange={(e) => setForm({ ...form, notizen: e.target.value })} rows={2} /></div>
              <Button className="w-full" onClick={handleSave}>{editId ? "Speichern" : "Hinzufügen"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Typ</TableHead>
              <TableHead>Bezeichnung</TableHead>
              <TableHead>Fällig am</TableHead>
              <TableHead>Erledigt am</TableHead>
              <TableHead>Kosten</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Lade...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Keine Wartungseinträge vorhanden</TableCell></TableRow>
            ) : items.map((m) => {
              const Icon = statusIcons[m.status] ?? Wrench;
              return (
                <TableRow key={m.id}>
                  <TableCell><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-muted-foreground" />{typLabels[m.typ] ?? m.typ}</div></TableCell>
                  <TableCell className="font-medium">{m.bezeichnung}</TableCell>
                  <TableCell>{new Date(m.faellig_am).toLocaleDateString("de-DE")}</TableCell>
                  <TableCell>{m.erledigt_am ? new Date(m.erledigt_am).toLocaleDateString("de-DE") : "–"}</TableCell>
                  <TableCell>{m.kosten != null ? `${m.kosten} €` : "–"}</TableCell>
                  <TableCell><Badge variant={statusColors[m.status] as any}>{statusLabels[m.status] ?? m.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
