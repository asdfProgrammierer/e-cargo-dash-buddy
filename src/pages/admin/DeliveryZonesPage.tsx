import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, MapPinned, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  deliveryZoneSchema,
  formatPostcodes,
  getZoneBadgeStyle,
  parsePostcodes,
  type DeliveryZoneFormValues,
  type DeliveryZoneRecord,
} from "@/lib/deliveryZones";

const emptyForm: DeliveryZoneFormValues = {
  name: "",
  label: "",
  color: "",
  description: "",
  sortOrder: 0,
  active: true,
  postcodesText: "",
};

const DeliveryZonesPage = () => {
  const [zones, setZones] = useState<DeliveryZoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editZone, setEditZone] = useState<DeliveryZoneRecord | null>(null);
  const [form, setForm] = useState<DeliveryZoneFormValues>(emptyForm);

  const totalPostcodes = useMemo(
    () => zones.reduce((sum, zone) => sum + (zone.delivery_zone_postcodes?.length ?? 0), 0),
    [zones],
  );

  const loadZones = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("delivery_zones")
      .select("id, name, label, color, description, sort_order, active, delivery_zone_postcodes(id, postcode)")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      toast.error("Lieferzonen konnten nicht geladen werden");
      setLoading(false);
      return;
    }

    const normalized = ((data as DeliveryZoneRecord[] | null) ?? []).map((zone) => ({
      ...zone,
      delivery_zone_postcodes: [...(zone.delivery_zone_postcodes ?? [])].sort((a, b) => a.postcode.localeCompare(b.postcode, "de")),
    }));

    setZones(normalized);
    setLoading(false);
  };

  useEffect(() => {
    loadZones();
  }, []);

  const resetDialog = () => {
    setDialogOpen(false);
    setEditZone(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditZone(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (zone: DeliveryZoneRecord) => {
    setEditZone(zone);
    setForm({
      name: zone.name,
      label: zone.label,
      color: zone.color ?? "",
      description: zone.description ?? "",
      sortOrder: zone.sort_order,
      active: zone.active,
      postcodesText: formatPostcodes((zone.delivery_zone_postcodes ?? []).map((entry) => entry.postcode)),
    });
    setDialogOpen(true);
  };

  const saveZone = async () => {
    const parsed = deliveryZoneSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen");
      return;
    }

    let postcodes: string[] = [];

    try {
      postcodes = parsePostcodes(parsed.data.postcodesText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PLZ-Liste ist ungültig";
      toast.error(message);
      return;
    }

    if (postcodes.length === 0) {
      toast.error("Bitte mindestens eine PLZ hinterlegen");
      return;
    }

    setSaving(true);

    const payload = {
      name: parsed.data.name,
      label: parsed.data.label,
      color: parsed.data.color || null,
      description: parsed.data.description || null,
      sort_order: parsed.data.sortOrder,
      active: parsed.data.active,
    };

    const zoneResult = editZone
      ? await supabase.from("delivery_zones").update(payload).eq("id", editZone.id).select("id").single()
      : await supabase.from("delivery_zones").insert(payload).select("id").single();

    if (zoneResult.error || !zoneResult.data) {
      toast.error("Zone konnte nicht gespeichert werden");
      setSaving(false);
      return;
    }

    const zoneId = zoneResult.data.id;

    if (editZone) {
      const { error: deleteError } = await supabase.from("delivery_zone_postcodes").delete().eq("zone_id", zoneId);
      if (deleteError) {
        toast.error("PLZ-Zuordnung konnte nicht aktualisiert werden");
        setSaving(false);
        return;
      }
    }

    const { error: postcodeError } = await supabase.from("delivery_zone_postcodes").insert(
      postcodes.map((postcode) => ({ zone_id: zoneId, postcode })),
    );

    if (postcodeError) {
      toast.error(
        postcodeError.message.includes("delivery_zone_postcodes_postcode_unique")
          ? "Mindestens eine PLZ ist bereits einer anderen Zone zugeordnet"
          : "PLZ konnten nicht gespeichert werden",
      );
      setSaving(false);
      return;
    }

    toast.success(editZone ? "Zone aktualisiert" : "Zone angelegt");
    resetDialog();
    setSaving(false);
    await loadZones();
  };

  const deleteZone = async (zone: DeliveryZoneRecord) => {
    const confirmed = window.confirm(`Zone „${zone.name}“ wirklich löschen?`);
    if (!confirmed) return;

    const { error } = await supabase.from("delivery_zones").delete().eq("id", zone.id);
    if (error) {
      toast.error("Zone konnte nicht gelöscht werden");
      return;
    }

    toast.success("Zone gelöscht");
    await loadZones();
  };

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Aktive Zonen</CardDescription>
              <CardTitle className="text-3xl">{zones.filter((zone) => zone.active).length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Hinterlegte PLZ</CardDescription>
              <CardTitle className="text-3xl">{totalPostcodes}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Etikettenhinweis</CardDescription>
              <CardTitle className="text-lg">Zonenkürzel oben rechts</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              Für schnelle Sortierung wird die Zone aus der Empfänger-PLZ direkt auf dem Etikett angezeigt.
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Lieferzonen</CardTitle>
              <CardDescription>Ordne belieferte Postleitzahlen einer Zone zu und definiere ein gut sichtbares Etiketten-Kürzel.</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? resetDialog() : setDialogOpen(true))}>
              <DialogTrigger asChild>
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Zone anlegen
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editZone ? "Zone bearbeiten" : "Neue Lieferzone"}</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="zone-name">Zonenname</Label>
                    <Input id="zone-name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zone-label">Zonenkürzel fürs Etikett</Label>
                    <Input id="zone-label" value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value.toUpperCase() }))} placeholder="z. B. ZONE A" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zone-color">Farbe optional</Label>
                    <Input id="zone-color" value={form.color ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))} placeholder="#2F855A" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zone-order">Sortierung</Label>
                    <Input id="zone-order" type="number" min={0} value={form.sortOrder} onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="zone-description">Beschreibung</Label>
                    <Input id="zone-description" value={form.description ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="z. B. Innenstadt Essen / Vormittagssortierung" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="zone-postcodes">Postleitzahlen</Label>
                    <Textarea id="zone-postcodes" rows={5} value={form.postcodesText} onChange={(e) => setForm((prev) => ({ ...prev, postcodesText: e.target.value }))} placeholder="45127, 45128, 45130" />
                    <p className="text-xs text-muted-foreground">Mehrere PLZ mit Komma, Leerzeichen oder Zeilenumbruch trennen.</p>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 md:col-span-2">
                    <div>
                      <p className="text-sm font-medium">Zone aktiv</p>
                      <p className="text-xs text-muted-foreground">Nur aktive Zonen werden für die automatische Zuordnung verwendet.</p>
                    </div>
                    <Switch checked={form.active} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, active: checked }))} />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={resetDialog}>Abbrechen</Button>
                  <Button onClick={saveZone} disabled={saving}>{saving ? "Speichert..." : editZone ? "Änderungen speichern" : "Zone anlegen"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : zones.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
                Noch keine Lieferzonen angelegt.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zone</TableHead>
                    <TableHead>Etikett</TableHead>
                    <TableHead>PLZ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zones.map((zone) => {
                    const postcodes = (zone.delivery_zone_postcodes ?? []).map((entry) => entry.postcode);
                    return (
                      <TableRow key={zone.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{zone.name}</div>
                            {zone.description && <div className="text-xs text-muted-foreground">{zone.description}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-border font-semibold" style={getZoneBadgeStyle(zone.color)}>
                            {zone.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[360px] text-sm text-muted-foreground">{formatPostcodes(postcodes)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={zone.active ? "secondary" : "outline"}>{zone.active ? "Aktiv" : "Inaktiv"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(zone)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteZone(zone)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><MapPinned className="h-5 w-5" /> Sortierlogik</CardTitle>
            <CardDescription>Die erste passende PLZ-Zuordnung bestimmt die Zone. Jede PLZ kann nur genau einer Zone zugeordnet sein.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default DeliveryZonesPage;