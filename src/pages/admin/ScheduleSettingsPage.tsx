import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { SCHEDULE_STATUSES } from "@/lib/driverSchedule";
import { scheduleStartTime } from "@/lib/driverScheduleDates";
import { toast } from "sonner";

const ScheduleSettingsPage = () => {
  const [startTime, setStartTime] = useState("");
  const [enabled, setEnabled] = useState<string[]>(SCHEDULE_STATUSES.map((s) => s.key));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("driver_schedule_settings").select("default_start_time, enabled_statuses").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (error) toast.error("Einstellungen konnten nicht geladen werden");
      else if (data) { setStartTime(data.default_start_time?.slice(0, 5) ?? ""); setEnabled(data.enabled_statuses ?? []); }
      setLoading(false);
    });
  }, []);

  const save = async () => {
    let time: string | null;
    try { time = scheduleStartTime(startTime); } catch (e) { toast.error((e as Error).message); return; }
    setSaving(true);
    const statuses = Array.from(new Set(["dienst", ...enabled]));
    const { error } = await supabase.from("driver_schedule_settings")
      .upsert({ id: 1, default_start_time: time, enabled_statuses: statuses, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error("Speichern fehlgeschlagen");
    else { setEnabled(statuses); toast.success("Einstellungen gespeichert"); }
  };

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />
      <Card className="max-w-xl">
        <CardHeader><CardTitle className="text-base">Einsatzplan</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="default-start">Standard-Startzeit</Label>
            <Input id="default-start" type="time" value={startTime} disabled={loading} onChange={(e) => setStartTime(e.target.value)} className="max-w-[10rem]" />
            <p className="text-xs text-muted-foreground">Wird bei neuen Einträgen vorausgefüllt. Leer lassen für keine Vorgabe.</p>
          </div>
          <div className="space-y-3">
            <Label>Auswählbare Status</Label>
            {SCHEDULE_STATUSES.map((s) => {
              const locked = s.key === "dienst";
              return (
                <div key={s.key} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="flex items-center gap-2 text-sm"><span className={`inline-block h-4 w-4 rounded ${s.cls}`} />{s.label}</span>
                  <Switch aria-label={s.label} checked={locked || enabled.includes(s.key)} disabled={locked || loading}
                    onCheckedChange={(on) => setEnabled(on ? [...enabled, s.key] : enabled.filter((k) => k !== s.key))} />
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">Ausgeblendete Status erscheinen nicht mehr in der Auswahl. Bestehende Einträge bleiben erhalten. „Dienst" ist immer aktiv.</p>
          </div>
          <Button onClick={save} disabled={saving || loading}>{saving ? "Speichert…" : "Speichern"}</Button>
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default ScheduleSettingsPage;
