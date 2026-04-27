import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const RouteSettingsPage = () => {
  const [stopDuration, setStopDuration] = useState<number>(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("route_settings")
        .select("stop_duration_minutes")
        .eq("id", 1)
        .maybeSingle();
      if (error) toast.error("Einstellungen konnten nicht geladen werden");
      else if (data) setStopDuration(data.stop_duration_minutes);
      setLoading(false);
    })();
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
    else toast.success("Einstellungen gespeichert");
  };

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Routen-Einstellungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="stop-duration">Stopp-Dauer (Minuten)</Label>
            <Input
              id="stop-duration"
              type="number"
              min={0}
              step={1}
              value={loading ? "" : stopDuration}
              onChange={(e) => setStopDuration(Number(e.target.value))}
              className="mt-1 max-w-[160px]"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Pufferzeit pro Stopp für Paketsuche & Übergabe. Wird zur ETA jedes Stopps addiert.
            </p>
          </div>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "Speichere…" : "Speichern"}
          </Button>
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default RouteSettingsPage;
