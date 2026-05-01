import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PlayCircle, RefreshCw, Clock, CheckCircle2, XCircle } from "lucide-react";

interface CronStatus {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  command: string;
}

interface CronRun {
  runid: number;
  jobid: number;
  start_time: string;
  end_time: string | null;
  status: string;
  return_message: string | null;
}

interface PickupSettings {
  deadline_hour: number;
  deadline_minute: number;
  updated_at: string;
}

function formatBerlin(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

const PickupCronPage = () => {
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [deadline, setDeadline] = useState<string>("14:00");
  const [savedDeadline, setSavedDeadline] = useState<string>("14:00");
  const [savingDeadline, setSavingDeadline] = useState(false);

  const load = async () => {
    setLoading(true);
    const [statusRes, runsRes, settingsRes] = await Promise.all([
      (supabase as any).rpc("admin_get_pickup_cron_status"),
      (supabase as any).rpc("admin_get_pickup_cron_runs", { _limit: 20 }),
      (supabase as any).from("pickup_cron_settings").select("deadline_hour, deadline_minute, updated_at").eq("id", 1).single(),
    ]);
    if (statusRes.error) {
      toast.error("Cron-Status konnte nicht geladen werden");
    } else {
      setStatus((statusRes.data as CronStatus[])?.[0] ?? null);
    }
    if (runsRes.error) {
      toast.error("Cron-Läufe konnten nicht geladen werden");
    } else {
      setRuns((runsRes.data as CronRun[]) ?? []);
    }
    if (!settingsRes.error && settingsRes.data) {
      const s = settingsRes.data as PickupSettings;
      const formatted = `${String(s.deadline_hour).padStart(2, "0")}:${String(s.deadline_minute).padStart(2, "0")}`;
      setDeadline(formatted);
      setSavedDeadline(formatted);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const triggerNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("generate-pickup-orders", {
      body: { bypassDeadline: true },
    });
    setRunning(false);
    if (error) {
      toast.error(`Auslösen fehlgeschlagen: ${error.message}`);
      return;
    }
    const eligible = (data as any)?.eligibleCount ?? 0;
    const created = ((data as any)?.results ?? []).filter((r: any) => r.status === "created" || r.status === "created_no_geo").length;
    const skipped = ((data as any)?.results ?? []).filter((r: any) => r.status === "skipped_exists").length;
    toast.success(`Lauf abgeschlossen: ${created} erstellt, ${skipped} übersprungen (von ${eligible} berechtigt)`);
    setTimeout(load, 500);
  };

  const saveDeadline = async () => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(deadline.trim());
    if (!match) {
      toast.error("Bitte Format HH:MM verwenden");
      return;
    }
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      toast.error("Ungültige Uhrzeit");
      return;
    }
    setSavingDeadline(true);
    const { error } = await (supabase as any).rpc("admin_set_pickup_deadline", {
      _hour: hour,
      _minute: minute,
    });
    setSavingDeadline(false);
    if (error) {
      toast.error(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }
    setSavedDeadline(deadline);
    toast.success(`Deadline auf ${deadline} Uhr (Berlin) gesetzt`);
  };

  const lastRun = runs[0] ?? null;

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tägliche Deadline (Berliner Zeit)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="deadline">Uhrzeit</Label>
                <Input
                  id="deadline"
                  type="time"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={saveDeadline} disabled={savingDeadline || deadline === savedDeadline}>
                {savingDeadline ? "Speichere..." : "Speichern"}
              </Button>
              <p className="text-xs text-muted-foreground sm:ml-2">
                Aktuell aktiv: <span className="font-medium">{savedDeadline}</span> · Sommer-/Winterzeit wird automatisch berücksichtigt.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Cron-Job „Abholungen“</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Aktualisieren
              </Button>
              <Button size="sm" onClick={triggerNow} disabled={running}>
                <PlayCircle className={`mr-2 h-4 w-4 ${running ? "animate-pulse" : ""}`} />
                {running ? "Läuft..." : "Jetzt manuell auslösen"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!status ? (
              <p className="text-sm text-muted-foreground">Kein Cron-Job gefunden.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{status.jobname}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={status.active ? "default" : "secondary"}>
                    {status.active ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Zeitplan (UTC)</p>
                  <p className="font-mono text-sm">{status.schedule}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lokale Ausführung</p>
                  <p className="text-sm">Täglich um <span className="font-medium">{savedDeadline}</span> Berliner Zeit</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Letzter Lauf</p>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {lastRun ? (
                      <>
                        <span>{formatBerlin(lastRun.start_time)}</span>
                        {lastRun.status === "succeeded" ? (
                          <Badge variant="outline" className="border-success text-success">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> erfolgreich
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-destructive text-destructive">
                            <XCircle className="mr-1 h-3 w-3" /> {lastRun.status}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Noch keine Läufe</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Letzte 20 Ausführungen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Start (Berlin)</TableHead>
                    <TableHead>Ende</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Meldung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        Lade...
                      </TableCell>
                    </TableRow>
                  ) : runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        Noch keine Läufe protokolliert
                      </TableCell>
                    </TableRow>
                  ) : (
                    runs.map((r) => (
                      <TableRow key={r.runid}>
                        <TableCell className="font-mono text-xs">{formatBerlin(r.start_time)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatBerlin(r.end_time)}</TableCell>
                        <TableCell>
                          {r.status === "succeeded" ? (
                            <Badge variant="outline" className="border-success text-success">erfolgreich</Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive text-destructive">{r.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md truncate" title={r.return_message ?? ""}>
                          {r.return_message ?? "–"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default PickupCronPage;