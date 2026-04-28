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
import { Plus, UserCircle, Pencil, Trash2, KeyRound, Smartphone, Copy } from "lucide-react";

interface Driver {
  id: string;
  name: string;
  telefon: string | null;
  email: string | null;
  fuehrerscheinklasse: string | null;
  status: "aktiv" | "inaktiv";
  notizen: string | null;
  username: string | null;
  auth_user_id: string | null;
  last_login_at: string | null;
}

const emptyForm = { name: "", telefon: "", email: "", fuehrerscheinklasse: "", status: "aktiv" as "aktiv" | "inaktiv", notizen: "" };

const FahrerPage = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [credDriver, setCredDriver] = useState<Driver | null>(null);
  const [credUsername, setCredUsername] = useState("");
  const [credBusy, setCredBusy] = useState(false);
  const [showPin, setShowPin] = useState<{ username: string; pin: string } | null>(null);

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

  const openCredentials = (d: Driver) => {
    setCredDriver(d);
    setCredUsername(d.username ?? "");
  };

  const handleActivateLogin = async () => {
    if (!credDriver) return;
    const u = credUsername.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) {
      toast.error("Username: 3-32 Zeichen, nur a-z, 0-9, . _ -");
      return;
    }
    setCredBusy(true);
    const { data, error } = await supabase.functions.invoke("driver-create-credentials", {
      body: { driver_id: credDriver.id, username: u },
    });
    setCredBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Fehler beim Aktivieren");
      return;
    }
    setShowPin({ username: (data as any).username, pin: (data as any).pin });
    setCredDriver(null);
    fetch();
  };

  const handleResetPin = async (d: Driver) => {
    setCredBusy(true);
    const { data, error } = await supabase.functions.invoke("driver-reset-pin", {
      body: { driver_id: d.id },
    });
    setCredBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Fehler beim Zurücksetzen");
      return;
    }
    setShowPin({ username: (data as any).username, pin: (data as any).pin });
    setCredDriver(null);
  };

  const copyPin = (pin: string) => {
    navigator.clipboard.writeText(pin);
    toast.success("PIN kopiert");
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
                <TableHead>Login</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Führerschein</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Lade...</TableCell></TableRow>
              ) : drivers.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Keine Fahrer vorhanden</TableCell></TableRow>
              ) : drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2"><UserCircle className="h-4 w-4 text-muted-foreground" />{d.name}</div></TableCell>
                  <TableCell>
                    {d.auth_user_id ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-mono">@{d.username}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {d.last_login_at ? `Letzter Login ${new Date(d.last_login_at).toLocaleDateString("de-DE")}` : "Noch nicht eingeloggt"}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs">Kein Login</Badge>
                    )}
                  </TableCell>
                  <TableCell>{d.telefon || "–"}</TableCell>
                  <TableCell>{d.email || "–"}</TableCell>
                  <TableCell>{d.fuehrerscheinklasse || "–"}</TableCell>
                  <TableCell><Badge variant={d.status === "aktiv" ? "default" : "secondary"}>{d.status === "aktiv" ? "Aktiv" : "Inaktiv"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {d.auth_user_id ? (
                      <Button variant="ghost" size="icon" title="PIN zurücksetzen" onClick={() => handleResetPin(d)} disabled={credBusy}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" title="Login aktivieren" onClick={() => openCredentials(d)}>
                        <Smartphone className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Activate login dialog */}
        <Dialog open={!!credDriver} onOpenChange={(v) => !v && setCredDriver(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Login aktivieren – {credDriver?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Username</Label>
                <Input
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  placeholder="max.mueller"
                  autoCapitalize="none"
                />
                <p className="text-xs text-muted-foreground mt-1">3-32 Zeichen, nur Kleinbuchstaben, Ziffern und . _ -</p>
              </div>
              <Button className="w-full" onClick={handleActivateLogin} disabled={credBusy}>
                Login aktivieren & PIN erzeugen
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Show PIN dialog (one-time) */}
        <Dialog open={!!showPin} onOpenChange={(v) => !v && setShowPin(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Zugangsdaten – einmalig anzeigen</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Bitte notieren oder weitergeben. Der PIN wird aus Sicherheitsgründen nicht erneut angezeigt.
              </p>
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div>
                  <Label className="text-xs">Username</Label>
                  <p className="font-mono text-lg">{showPin?.username}</p>
                </div>
                <div>
                  <Label className="text-xs">PIN</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-2xl tracking-widest flex-1">{showPin?.pin}</p>
                    <Button variant="outline" size="icon" onClick={() => showPin && copyPin(showPin.pin)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button className="w-full" onClick={() => setShowPin(null)}>Verstanden</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default FahrerPage;
