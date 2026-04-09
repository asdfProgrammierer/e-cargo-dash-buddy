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
import { Plus, UserCircle, Pencil, Trash2 } from "lucide-react";

interface Driver {
  id: string;
  name: string;
  telefon: string | null;
  email: string | null;
  fuehrerscheinklasse: string | null;
  status: "aktiv" | "inaktiv";
  notizen: string | null;
}

const emptyForm = { name: "", telefon: "", email: "", fuehrerscheinklasse: "", status: "aktiv" as "aktiv" | "inaktiv", notizen: "" };

const FahrerPage = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetch = async () => {
    const { data } = await supabase.from("drivers").select("*").order("created_at", { ascending: false });
    setDrivers((data as Driver[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name ist erforderlich"); return; }
    const payload = { name: form.name, telefon: form.telefon || null, email: form.email || null, fuehrerscheinklasse: form.fuehrerscheinklasse || null, status: form.status, notizen: form.notizen || null };

    if (editId) {
      const { error } = await supabase.from("drivers").update(payload).eq("id", editId);
      if (error) { toast.error("Fehler beim Speichern"); return; }
      toast.success("Fahrer aktualisiert");
    } else {
      const { error } = await supabase.from("drivers").insert(payload);
      if (error) { toast.error("Fehler beim Erstellen"); return; }
      toast.success("Fahrer hinzugefügt");
    }
    setOpen(false); setEditId(null); setForm(emptyForm); fetch();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Fahrer gelöscht"); fetch();
  };

  const openEdit = (d: Driver) => {
    setEditId(d.id);
    setForm({ name: d.name, telefon: d.telefon ?? "", email: d.email ?? "", fuehrerscheinklasse: d.fuehrerscheinklasse ?? "", status: d.status, notizen: d.notizen ?? "" });
    setOpen(true);
  };

  return (
    <AdminLayout title="Fahrerverwaltung">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground text-sm">{drivers.length} Fahrer</p>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />Fahrer hinzufügen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Fahrer bearbeiten" : "Neuer Fahrer"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Telefon</Label><Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} /></div>
                  <div><Label>E-Mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Führerscheinklasse</Label><Input value={form.fuehrerscheinklasse} onChange={(e) => setForm({ ...form, fuehrerscheinklasse: e.target.value })} /></div>
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "aktiv" | "inaktiv" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aktiv">Aktiv</SelectItem>
                        <SelectItem value="inaktiv">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                <TableHead>Name</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Führerschein</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Lade...</TableCell></TableRow>
              ) : drivers.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Keine Fahrer vorhanden</TableCell></TableRow>
              ) : drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2"><UserCircle className="h-4 w-4 text-muted-foreground" />{d.name}</div></TableCell>
                  <TableCell>{d.telefon || "–"}</TableCell>
                  <TableCell>{d.email || "–"}</TableCell>
                  <TableCell>{d.fuehrerscheinklasse || "–"}</TableCell>
                  <TableCell><Badge variant={d.status === "aktiv" ? "default" : "secondary"}>{d.status === "aktiv" ? "Aktiv" : "Inaktiv"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

export default FahrerPage;
