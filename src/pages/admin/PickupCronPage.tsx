import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function formatBerlin(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function describeSchedule(cron: string): string {
  // simple label for "5 12 * * *" → "Täglich 14:05 Berlin (Sommerzeit)"
  const parts = cron.trim().split(/\s+/);
  if (parts.length === 5 && parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
    const min = parts[0].padStart(2, "0");
    const hourUtc = parseInt(parts[1], 10);
    if (!Number.isNaN(hourUtc)) {
      const summer = (hourUtc + 2) % 24;
      const winter = (hourUtc + 1) % 24;
      return `Täglich ${String(summer).padStart(2, "0")}:${min} Berlin (Sommer) · ${String(winter).padStart(2, "0")}:${min} (Winter)`;
    }
  }
  return cron;
}

const PickupCronPage = () => {
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const [statusRes, runsRes] = await Promise.all([
      (supabase as any).rpc("admin_get_pickup_cron_status"),
      (supabase as any).rpc("admin_get_pickup_cron_runs", { _limit: 20 }),
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
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const triggerNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("generate-pickup-orders", {
      body: {},
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

  const lastRun = runs[0] ?? null;

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />

      <div className="space-y-6">
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
                  <p className="text-sm">{describeSchedule(status.schedule)}</p>
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