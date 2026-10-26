import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { geocodeAndSaveOrder } from "@/lib/geocodeOrder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Wartung: fehlende Koordinaten von Aufträgen nachträglich ermitteln (max. 50 pro Lauf). */
export function GeocodeMaintenanceCard() {
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
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
          const res = await geocodeAndSaveOrder(o.id, {
            strasse: o.empfaenger_adresse,
            plz: o.empfaenger_plz,
            stadt: o.empfaenger_stadt,
          });
          if (!res) { failed++; continue; }
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
      setRunning(false);
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" /> Wartung: Adressen verorten
        </CardTitle>
        <CardDescription>
          Ermittelt fehlende Kartenpositionen für Aufträge (max. 50 pro Klick).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={run} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          Bestellungen geocodieren
        </Button>
      </CardContent>
    </Card>
  );
}
