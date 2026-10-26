import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Standard-Stopp-Dauer für neue Routen (kann pro Route überschrieben werden). */
export function RouteDefaultsCard() {
  const [stopDuration, setStopDuration] = useState<number>(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("route_settings").select("stop_duration_minutes").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (error) toast.error("Einstellungen konnten nicht geladen werden");
      else if (data) setStopDuration(data.stop_duration_minutes);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    if (!Number.isFinite(stopDuration) || stopDuration < 0) {
      toast.error("Stopp-Dauer muss eine positive Zahl sein");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("route_settings")
      .update({ stop_duration_minutes: Math.round(stopDuration) })
      .eq("id", 1);
    setSaving(false);
    if (error) toast.error("Speichern fehlgeschlagen");
    else toast.success("Stopp-Dauer gespeichert");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Routen-Grundeinstellung</CardTitle>
        <CardDescription>
          Standard-Pufferzeit pro Stopp für Paketsuche & Übergabe. Kann beim Erstellen einer Route angepasst werden.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="stop-duration">Stopp-Dauer (Minuten)</Label>
          <Input
            id="stop-duration"
            type="number"
            min={0}
            step={1}
            value={loading ? "" : stopDuration}
            onChange={(e) => setStopDuration(Number(e.target.value))}
            className="mt-1 w-[140px]"
            disabled={loading}
          />
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? "Speichere…" : "Speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
