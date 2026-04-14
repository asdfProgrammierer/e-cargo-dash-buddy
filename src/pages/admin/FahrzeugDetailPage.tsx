import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Truck } from "lucide-react";
import { MaintenanceTab } from "@/components/admin/MaintenanceTab";
import { InspectionTab } from "@/components/admin/InspectionTab";

const typLabels: Record<string, string> = { lastenrad: "Lastenrad", e_van: "E-Van", transporter: "Transporter", sonstige: "Sonstige" };
const statusLabels: Record<string, string> = { verfuegbar: "Verfügbar", unterwegs: "Unterwegs", in_wartung: "In Wartung" };

interface Vehicle {
  id: string;
  kennzeichen: string;
  typ: string;
  kapazitaet_kg: number;
  status: string;
  notizen: string | null;
}

const FahrzeugDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase.from("vehicles").select("*").eq("id", id).single().then(({ data }) => {
      setVehicle(data as Vehicle | null);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <AdminLayout title="Fahrzeug laden..."><div /></AdminLayout>;
  if (!vehicle) return <AdminLayout title="Nicht gefunden"><p>Fahrzeug nicht gefunden.</p></AdminLayout>;

  return (
    <AdminLayout title={vehicle.kennzeichen}>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/fahrzeuge")}>
          <ArrowLeft className="mr-2 h-4 w-4" />Zurück
        </Button>

        {/* Vehicle info card */}
        <Card>
          <CardContent className="flex items-center gap-6 p-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
              <Truck className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 grid gap-1">
              <h2 className="text-xl font-bold">{vehicle.kennzeichen}</h2>
              <p className="text-sm text-muted-foreground">{typLabels[vehicle.typ] ?? vehicle.typ} · {vehicle.kapazitaet_kg} kg Kapazität</p>
            </div>
            <Badge variant={vehicle.status === "verfuegbar" ? "default" : vehicle.status === "unterwegs" ? "secondary" : "destructive"}>
              {statusLabels[vehicle.status] ?? vehicle.status}
            </Badge>
          </CardContent>
        </Card>

        <Tabs defaultValue="wartung">
          <TabsList>
            <TabsTrigger value="wartung">Wartungsplan</TabsTrigger>
            <TabsTrigger value="kontrolle">Kontrollliste</TabsTrigger>
          </TabsList>

          <TabsContent value="wartung" className="mt-4">
            <MaintenanceTab vehicleId={vehicle.id} />
          </TabsContent>

          <TabsContent value="kontrolle" className="mt-4">
            <InspectionTab vehicleId={vehicle.id} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default FahrzeugDetailPage;
