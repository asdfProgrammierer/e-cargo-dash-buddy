import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Truck, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MaintenanceTab } from "@/components/admin/MaintenanceTab";
import { InspectionTab } from "@/components/admin/InspectionTab";
import { VehicleCostTab } from "@/components/admin/VehicleCostTab";
import { VehicleCostItems, type CostItem } from "@/components/admin/VehicleCostItems";
import { sumCostItems } from "@/lib/vehicleCosts";

const typLabels: Record<string, string> = { lastenrad: "Lastenrad", e_van: "E-Van", transporter: "Transporter", sonstige: "Sonstige" };
const statusLabels: Record<string, string> = { verfuegbar: "Verfügbar", unterwegs: "Unterwegs", in_wartung: "In Wartung" };

type Typ = "lastenrad" | "e_van" | "transporter" | "sonstige";
type Status = "verfuegbar" | "unterwegs" | "in_wartung";
interface Vehicle { id: string; kennzeichen: string; typ: Typ; kapazitaet_kg: number; status: Status; notizen: string | null }

const FahrzeugDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [form, setForm] = useState({ kennzeichen: "", typ: "lastenrad" as Typ, kapazitaet_kg: "0", status: "verfuegbar" as Status, notizen: "" });

  const loadItems = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("vehicle_cost_items").select("id, bezeichnung, intervall, betrag, strompreis_kwh, verbrauch_kwh_100km").eq("vehicle_id", id).order("sort_order").order("created_at");
    setItems(((data ?? []) as CostItem[]).map((i) => ({ ...i, betrag: Number(i.betrag), strompreis_kwh: i.strompreis_kwh == null ? null : Number(i.strompreis_kwh), verbrauch_kwh_100km: i.verbrauch_kwh_100km == null ? null : Number(i.verbrauch_kwh_100km) })));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    supabase.from("vehicles").select("id, kennzeichen, typ, kapazitaet_kg, status, notizen").eq("id", id).single().then(({ data }) => {
      setVehicle(data as Vehicle | null);
      setLoading(false);
    });
    loadItems();
  }, [id, loadItems]);

  const openEdit = () => {
    if (!vehicle) return;
    setForm({ kennzeichen: vehicle.kennzeichen, typ: vehicle.typ, kapazitaet_kg: String(vehicle.kapazitaet_kg), status: vehicle.status, notizen: vehicle.notizen ?? "" });
    setEditOpen(true);
  };

  const save = async () => {
    if (!vehicle) return;
    if (!form.kennzeichen.trim()) return toast.error("Kennzeichen ist erforderlich");
    const payload = { kennzeichen: form.kennzeichen.trim(), typ: form.typ, kapazitaet_kg: Number(form.kapazitaet_kg) || 0, status: form.status, notizen: form.notizen || null };
    const { error } = await supabase.from("vehicles").update(payload).eq("id", vehicle.id);
    if (error) return toast.error("Fehler beim Speichern");
    setVehicle({ ...vehicle, ...payload });
    setEditOpen(false);
    toast.success("Fahrzeug aktualisiert");
  };

  const remove = async () => {
    if (!vehicle) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", vehicle.id);
    if (error) return toast.error("Löschen fehlgeschlagen – evtl. noch Touren mit diesem Fahrzeug vorhanden");
    toast.success("Fahrzeug gelöscht");
    navigate("/admin/fahrzeuge");
  };

  if (loading) return <AdminLayout title="Fahrzeug laden..."><div /></AdminLayout>;
  if (!vehicle) return <AdminLayout title="Nicht gefunden"><p>Fahrzeug nicht gefunden.</p></AdminLayout>;

  const { fixPerMonth, costPerKm } = sumCostItems(items);

  return (
    <AdminLayout title={vehicle.kennzeichen}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/fahrzeuge")}>
            <ArrowLeft className="mr-2 h-4 w-4" />Zurück
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Bearbeiten</Button>
            <Button variant="destructive" size="sm" onClick={() => setDelOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Löschen</Button>
          </div>
        </div>

        <Card>
          <CardContent className="flex items-center gap-6 p-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
              <Truck className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 grid gap-1">
              <h2 className="text-xl font-bold">{vehicle.kennzeichen}</h2>
              <p className="text-sm text-muted-foreground">{typLabels[vehicle.typ] ?? vehicle.typ} · {vehicle.kapazitaet_kg} kg Kapazität</p>
              {vehicle.notizen && <p className="text-sm text-muted-foreground">{vehicle.notizen}</p>}
            </div>
            <Badge variant={vehicle.status === "verfuegbar" ? "default" : vehicle.status === "unterwegs" ? "secondary" : "destructive"}>
              {statusLabels[vehicle.status] ?? vehicle.status}
            </Badge>
          </CardContent>
        </Card>

        <Tabs defaultValue="wartung">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="wartung">Wartungsplan</TabsTrigger>
            <TabsTrigger value="kontrolle">Kontrollliste</TabsTrigger>
            <TabsTrigger value="kosten">Kosten & Statistik</TabsTrigger>
            <TabsTrigger value="kostenposten">Kostenpositionen</TabsTrigger>
          </TabsList>
          <TabsContent value="wartung" className="mt-4"><MaintenanceTab vehicleId={vehicle.id} /></TabsContent>
          <TabsContent value="kontrolle" className="mt-4"><InspectionTab vehicleId={vehicle.id} /></TabsContent>
          <TabsContent value="kosten" className="mt-4"><VehicleCostTab vehicleId={vehicle.id} fixPerMonth={fixPerMonth} costPerKm={costPerKm} /></TabsContent>
          <TabsContent value="kostenposten" className="mt-4"><VehicleCostItems vehicleId={vehicle.id} items={items} onChange={loadItems} /></TabsContent>
        </Tabs>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fahrzeug bearbeiten</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Kennzeichen *</Label><Input value={form.kennzeichen} onChange={(e) => setForm({ ...form, kennzeichen: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Typ</Label>
                <Select value={form.typ} onValueChange={(v) => setForm({ ...form, typ: v as Typ })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(typLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Kapazität (kg)</Label><Input type="number" value={form.kapazitaet_kg} onChange={(e) => setForm({ ...form, kapazitaet_kg: e.target.value })} /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(statusLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notizen</Label><Input value={form.notizen} onChange={(e) => setForm({ ...form, notizen: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Kosten stellst du im Reiter „Kostenpositionen" ein.</p>
            <Button className="w-full" onClick={save}>Speichern</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fahrzeug {vehicle.kennzeichen} löschen?</AlertDialogTitle>
            <AlertDialogDescription>Wartungsplan, Kontrollen und Kostenpositionen dieses Fahrzeugs gehen dabei verloren.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default FahrzeugDetailPage;
