import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Wrench, ShieldCheck, ChevronRight } from "lucide-react";

interface Vehicle {
  id: string;
  kennzeichen: string;
  typ: string;
}
interface Maint {
  id: string;
  vehicle_id: string;
  bezeichnung: string;
  faellig_am: string;
  status: string;
  kosten: number | null;
}
interface Inspection {
  id: string;
  vehicle_id: string;
  inspection_date: string;
  reifen_ok: boolean;
  bremsen_ok: boolean;
  lichter_ok: boolean;
  spiegel_ok: boolean;
  ausstattung_ok: boolean;
  sauberkeit_ok: boolean;
}

type Tone = "red" | "amber" | "green";

const dayDiff = (date: string) => Math.floor((new Date(date).getTime() - Date.now()) / 86400000);
const dayDiffPast = (date: string) => Math.floor((Date.now() - new Date(date).getTime()) / 86400000);

const toneCls: Record<Tone, string> = {
  red: "bg-destructive/15 text-destructive",
  amber: "bg-warning/15 text-warning",
  green: "bg-success/15 text-success",
};

export function VehicleAlertsCard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [maints, setMaints] = useState<Maint[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 14);
      const [vRes, mRes, iRes] = await Promise.all([
        supabase.from("vehicles").select("id, kennzeichen, typ"),
        supabase
          .from("maintenance_schedule")
          .select("id, vehicle_id, bezeichnung, faellig_am, status, kosten")
          .neq("status", "erledigt")
          .lte("faellig_am", cutoff.toISOString().slice(0, 10))
          .order("faellig_am", { ascending: true }),
        supabase
          .from("vehicle_inspections")
          .select("id, vehicle_id, inspection_date, reifen_ok, bremsen_ok, lichter_ok, spiegel_ok, ausstattung_ok, sauberkeit_ok")
          .order("inspection_date", { ascending: false }),
      ]);
      setVehicles((vRes.data ?? []) as Vehicle[]);
      setMaints((mRes.data ?? []) as Maint[]);
      setInspections((iRes.data ?? []) as Inspection[]);
      setLoading(false);
    };
    load();
  }, []);

  const vMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const maintenanceRows = useMemo(() => {
    return maints.map((m) => {
      const diff = dayDiff(m.faellig_am);
      const tone: Tone = diff < 0 ? "red" : diff <= 7 ? "amber" : "green";
      return { ...m, tone, diff, vehicle: vMap.get(m.vehicle_id) };
    });
  }, [maints, vMap]);

  const inspectionRows = useMemo(() => {
    const latest = new Map<string, Inspection>();
    inspections.forEach((i) => {
      if (!latest.has(i.vehicle_id)) latest.set(i.vehicle_id, i);
    });
    return vehicles
      .map((v) => {
        const last = latest.get(v.id);
        const age = last ? dayDiffPast(last.inspection_date) : null;
        const issues: string[] = [];
        if (last) {
          if (!last.reifen_ok) issues.push("Reifen");
          if (!last.bremsen_ok) issues.push("Bremsen");
          if (!last.lichter_ok) issues.push("Lichter");
          if (!last.spiegel_ok) issues.push("Spiegel");
          if (!last.ausstattung_ok) issues.push("Ausstattung");
          if (!last.sauberkeit_ok) issues.push("Sauberkeit");
        }
        let tone: Tone = "green";
        if (!last || age === null || age > 14 || issues.length > 0) tone = "red";
        else if (age > 10) tone = "amber";
        return { vehicle: v, last, age, issues, tone };
      })
      .filter((r) => r.tone !== "green")
      .sort((a, b) => (a.tone === "red" ? -1 : 1));
  }, [inspections, vehicles]);

  const warnVehicles = inspectionRows.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Fahrzeugmeldungen</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">Wartungen: {maintenanceRows.length}</Badge>
          <Badge variant="outline" className="text-xs">Warnungen: {warnVehicles}</Badge>
          <Button asChild size="sm" variant="ghost" className="text-xs">
            <Link to="/admin/fahrzeuge">Alle <ChevronRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Wartungen */}
            <div className="rounded-xl border border-border/50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Wrench className="h-4 w-4 text-primary" />
                Anstehende Wartungen
              </div>
              {maintenanceRows.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Keine offenen Wartungen in den nächsten 14 Tagen.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {maintenanceRows.slice(0, 5).map((m) => (
                    <li key={m.id} className="py-2">
                      <Link
                        to={`/admin/fahrzeuge/${m.vehicle_id}`}
                        className="flex items-start justify-between gap-3 hover:opacity-80"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <span className={`h-2 w-2 rounded-full ${toneCls[m.tone]}`} />
                            <span>{m.vehicle?.kennzeichen ?? "–"}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="truncate text-muted-foreground">{m.bezeichnung}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {m.diff < 0 ? `${Math.abs(m.diff)} Tage überfällig` : m.diff === 0 ? "Heute fällig" : `in ${m.diff} Tagen`}
                            {m.kosten != null && ` · ${Number(m.kosten).toFixed(2)} €`}
                          </p>
                        </div>
                        <Badge className={`${toneCls[m.tone]} border-0 text-[10px]`}>
                          {new Date(m.faellig_am).toLocaleDateString("de-DE")}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Sicherheitscheck */}
            <div className="rounded-xl border border-border/50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Sicherheitscheck-Status
              </div>
              {inspectionRows.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Alle Fahrzeuge im grünen Bereich.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {inspectionRows.slice(0, 5).map((r) => (
                    <li key={r.vehicle.id} className="py-2">
                      <Link
                        to={`/admin/fahrzeuge/${r.vehicle.id}`}
                        className="flex items-start justify-between gap-3 hover:opacity-80"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <span className={`h-2 w-2 rounded-full ${toneCls[r.tone]}`} />
                            <span>{r.vehicle.kennzeichen}</span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {!r.last
                              ? "Kein Check vorhanden"
                              : r.issues.length > 0
                              ? `Mängel: ${r.issues.join(", ")}`
                              : `Letzter Check vor ${r.age} Tagen`}
                          </p>
                        </div>
                        <Badge className={`${toneCls[r.tone]} border-0 text-[10px]`}>
                          {r.tone === "red" ? "Rot" : "Gelb"}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}