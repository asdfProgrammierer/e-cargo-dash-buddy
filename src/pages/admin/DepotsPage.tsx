import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Star, MapPin, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface Depot {
  id: string;
  name: string;
  strasse: string;
  plz: string;
  stadt: string;
  land: string;
  lat: number | null;
  lng: number | null;
  geocoded_at: string | null;
  is_default: boolean;
  active: boolean;
  notizen: string | null;
}

interface FormState {
  name: string;
  strasse: string;
  plz: string;
  stadt: string;
  land: string;
  is_default: boolean;
  active: boolean;
  notizen: string;
}

const emptyForm: FormState = {
  name: "",
  strasse: "",
  plz: "",
  stadt: "",
  land: "Deutschland",
  is_default: false,
  active: true,
  notizen: "",
};

const DepotsPage = () => {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Depot | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("depots")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    if (error) {
      toast.error("Depots konnten nicht geladen werden");
    } else {
      setDepots((data ?? []) as Depot[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, is_default: depots.length === 0 });
    setDialogOpen(true);
  };

  const openEdit = (depot: Depot) => {
    setEditing(depot);
    setForm({
      name: depot.name,
      strasse: depot.strasse,
      plz: depot.plz,
      stadt: depot.stadt,
      land: depot.land,
      is_default: depot.is_default,
      active: depot.active,
      notizen: depot.notizen ?? "",
    });
    setDialogOpen(true);
  };

  const geocode = async (depotId: string, payload: Pick<FormState, "strasse" | "plz" | "stadt" | "land">) => {
    const { data, error } = await supabase.functions.invoke("geocode-address", {
      body: payload,
    });
    if (error || !data || data.error) {
      const msg = data?.error || error?.message || "Unbekannter Fehler";
      toast.error(`Geocoding fehlgeschlagen: ${msg}`);
      return;
    }
    const { error: updErr } = await supabase
      .from("depots")
      .update({ lat: data.lat, lng: data.lng, geocoded_at: new Date().toISOString() })
      .eq("id", depotId);
    if (updErr) {
      toast.error("Koordinaten konnten nicht gespeichert werden");
      return;
    }
    toast.success("Adresse geocodiert");
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.strasse.trim() || !form.plz.trim() || !form.stadt.trim()) {
      toast.error("Bitte Name, Straße, PLZ und Stadt ausfüllen");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const addressChanged =
          editing.strasse !== form.strasse ||
          editing.plz !== form.plz ||
          editing.stadt !== form.stadt ||
          editing.land !== form.land;
        const { error } = await supabase
          .from("depots")
          .update({
            name: form.name.trim(),
            strasse: form.strasse.trim(),
            plz: form.plz.trim(),
            stadt: form.stadt.trim(),
            land: form.land.trim() || "Deutschland",
            is_default: form.is_default,
            active: form.active,
            notizen: form.notizen.trim() || null,
            ...(addressChanged ? { lat: null, lng: null, geocoded_at: null } : {}),
          })
          .eq("id", editing.id);
        if (error) throw error;
        if (addressChanged) {
          await geocode(editing.id, form);
        }
        toast.success("Depot aktualisiert");
      } else {
        const { data, error } = await supabase
          .from("depots")
          .insert({
            name: form.name.trim(),
            strasse: form.strasse.trim(),
            plz: form.plz.trim(),
            stadt: form.stadt.trim(),
            land: form.land.trim() || "Deutschland",
            is_default: form.is_default,
            active: form.active,
            notizen: form.notizen.trim() || null,
          })
          .select()
          .single();
        if (error) throw error;
        toast.success("Depot angelegt");
        if (data) await geocode(data.id, form);
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("depots").delete().eq("id", deleteId);
    if (error) {
      toast.error("Löschen fehlgeschlagen");
    } else {
      toast.success("Depot gelöscht");
      await load();
    }
    setDeleteId(null);
  };

  const setAsDefault = async (depot: Depot) => {
    if (depot.is_default) return;
    const { error } = await supabase.from("depots").update({ is_default: true }).eq("id", depot.id);
    if (error) {
      toast.error("Standard konnte nicht gesetzt werden");
    } else {
      toast.success(`${depot.name} ist jetzt Standard-Depot`);
      await load();
    }
  };

  const regeocode = async (depot: Depot) => {
    await geocode(depot.id, {
      strasse: depot.strasse,
      plz: depot.plz,
      stadt: depot.stadt,
      land: depot.land,
    });
    await load();
  };

  const bulkGeocodeOrders = async () => {
    setBulkRunning(true);
    try {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, empfaenger_adresse, empfaenger_plz, empfaenger_stadt")
        .is("geocoded_at", null)
        .not("empfaenger_stadt", "is", null)
        .limit(50);
      if (error) throw error;
      if (!orders || orders.length === 0) {
        toast.info("Alle Bestellungen sind bereits geocodiert");
        return;
      }
      let success = 0;
      let failed = 0;
      for (const o of orders) {
        try {
          const { data, error: gErr } = await supabase.functions.invoke("geocode-address", {
            body: {
              strasse: o.empfaenger_adresse ?? "",
              plz: o.empfaenger_plz ?? "",
              stadt: o.empfaenger_stadt,
            },
          });
          if (gErr || !data || data.error) {
            failed++;
            continue;
          }
          await supabase
            .from("orders")
            .update({ lat: data.lat, lng: data.lng, geocoded_at: new Date().toISOString() })
            .eq("id", o.id);
          success++;
          await new Promise((r) => setTimeout(r, 250));
        } catch {
          failed++;
        }
      }
      toast.success(`Geocoding: ${success} erfolgreich, ${failed} fehlgeschlagen (max. 50 pro Lauf)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk-Geocoding fehlgeschlagen");
    } finally {
      setBulkRunning(false);
    }
  };

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Depots</CardTitle>
              <CardDescription>
                Start- und Endpunkte für Touren. Eines kann als Standard markiert werden.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={bulkGeocodeOrders} disabled={bulkRunning}>
                {bulkRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Bestellungen geocodieren
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Depot anlegen
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editing ? "Depot bearbeiten" : "Neues Depot"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Name *</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="z. B. Zentraldepot Bochum"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Straße & Hausnr. *</Label>
                      <Input
                        value={form.strasse}
                        onChange={(e) => setForm((f) => ({ ...f, strasse: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>PLZ *</Label>
                        <Input
                          value={form.plz}
                          onChange={(e) => setForm((f) => ({ ...f, plz: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label>Stadt *</Label>
                        <Input
                          value={form.stadt}
                          onChange={(e) => setForm((f) => ({ ...f, stadt: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Land</Label>
                      <Input
                        value={form.land}
                        onChange={(e) => setForm((f) => ({ ...f, land: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notizen</Label>
                      <Textarea
                        value={form.notizen}
                        onChange={(e) => setForm((f) => ({ ...f, notizen: e.target.value }))}
                        rows={2}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">Als Standard-Depot</p>
                        <p className="text-xs text-muted-foreground">Voreinstellung für neue Routen</p>
                      </div>
                      <Switch
                        checked={form.is_default}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">Aktiv</p>
                        <p className="text-xs text-muted-foreground">Inaktive Depots erscheinen nicht in der Auswahl</p>
                      </div>
                      <Switch
                        checked={form.active}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                      Abbrechen
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Speichern
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : depots.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Noch keine Depots angelegt. Lege das erste Depot an, um Touren planen zu können.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Geocoding</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depots.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{d.name}</span>
                          {d.is_default && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3 fill-current" /> Standard
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {d.strasse}, {d.plz} {d.stadt}
                      </TableCell>
                      <TableCell>
                        <Badge variant={d.active ? "default" : "outline"}>
                          {d.active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {d.geocoded_at ? (
                          <span className="flex items-center gap-1 text-sm text-success">
                            <CheckCircle2 className="h-4 w-4" /> OK
                          </span>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => regeocode(d)} className="gap-1 text-warning">
                            <AlertCircle className="h-4 w-4" /> Erneut versuchen
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!d.is_default && (
                            <Button variant="ghost" size="icon" onClick={() => setAsDefault(d)} title="Als Standard">
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(d.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Depot wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default DepotsPage;