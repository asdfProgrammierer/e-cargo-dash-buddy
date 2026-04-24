import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface Stop {
  position: number;
  leg_distance_m: number | null;
  leg_duration_s: number | null;
  status: string;
  orders: {
    auftrags_nr: string;
    empfaenger_name: string;
    empfaenger_adresse: string | null;
    empfaenger_plz: string | null;
    empfaenger_stadt: string;
    empfaenger_telefon: string | null;
    pakete: number;
    gewicht: number;
    notizen: string | null;
  };
}
interface Route {
  name: string;
  datum: string;
  notizen: string | null;
  total_distance_m: number | null;
  total_duration_s: number | null;
  drivers: { name: string } | null;
  vehicles: { kennzeichen: string } | null;
}

function fmtKm(m: number | null) { return m == null ? "–" : (m / 1000).toFixed(1) + " km"; }
function fmtMin(s: number | null) { return s == null ? "–" : Math.round(s / 60) + " min"; }

const RouteDruckPage = () => {
  const { id } = useParams<{ id: string }>();
  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from("routes").select("name, datum, notizen, total_distance_m, total_duration_s, drivers(name), vehicles(kennzeichen)").eq("id", id).single(),
      supabase.from("route_stops")
        .select("position, leg_distance_m, leg_duration_s, status, orders(auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_telefon, pakete, gewicht, notizen)")
        .eq("route_id", id)
        .order("position", { ascending: true }),
    ]).then(([r, s]) => {
      setRoute(r.data as unknown as Route);
      setStops((s.data as unknown as Stop[]) ?? []);
    });
  }, [id]);

  const totals = stops.reduce((a, s) => ({
    pakete: a.pakete + (s.orders.pakete ?? 0),
    gewicht: a.gewicht + Number(s.orders.gewicht ?? 0),
  }), { pakete: 0, gewicht: 0 });

  return (
    <div className="min-h-screen bg-background p-6 print:p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold">Druckansicht</h1>
          <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Drucken</Button>
        </div>

        <div className="rounded-lg border bg-card p-6 print:border-0 print:p-0">
          <div className="border-b pb-3 mb-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-2xl font-bold">{route?.name ?? "Route"}</h2>
              <div className="text-sm text-muted-foreground">{route?.datum && new Date(route.datum).toLocaleDateString("de-DE")}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Fahrer: </span>{route?.drivers?.name ?? "–"}</div>
              <div><span className="text-muted-foreground">Fahrzeug: </span>{route?.vehicles?.kennzeichen ?? "–"}</div>
              <div><span className="text-muted-foreground">Strecke: </span>{fmtKm(route?.total_distance_m ?? null)}</div>
              <div><span className="text-muted-foreground">Fahrzeit: </span>{fmtMin(route?.total_duration_s ?? null)}</div>
              <div><span className="text-muted-foreground">Stops: </span>{stops.length}</div>
              <div><span className="text-muted-foreground">Pakete / Gewicht: </span>{totals.pakete} / {totals.gewicht.toFixed(1)} kg</div>
            </div>
            {route?.notizen && <div className="mt-2 text-sm"><span className="text-muted-foreground">Notiz: </span>{route.notizen}</div>}
          </div>

          <ol className="space-y-2">
            {stops.map((s) => (
              <li key={s.position} className="flex gap-3 rounded-md border p-3 break-inside-avoid">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  {s.position}
                </div>
                <div className="flex-1 text-sm">
                  <div className="flex items-baseline justify-between">
                    <div className="font-semibold">{s.orders.empfaenger_name}</div>
                    <div className="text-xs text-muted-foreground">{s.orders.auftrags_nr}</div>
                  </div>
                  <div>{s.orders.empfaenger_adresse}</div>
                  <div>{s.orders.empfaenger_plz} {s.orders.empfaenger_stadt}</div>
                  {s.orders.empfaenger_telefon && <div className="text-muted-foreground">Tel: {s.orders.empfaenger_telefon}</div>}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{s.orders.pakete} Paket(e)</span>
                    <span>{Number(s.orders.gewicht).toFixed(1)} kg</span>
                    {s.leg_distance_m != null && <span>Etappe: {fmtKm(s.leg_distance_m)} · {fmtMin(s.leg_duration_s)}</span>}
                  </div>
                  {s.orders.notizen && <div className="mt-1 rounded bg-muted p-1.5 text-xs">📝 {s.orders.notizen}</div>}
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border" /> Erledigt</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border" /> Übersprungen</span>
                    <span className="ml-auto text-muted-foreground">Unterschrift: ____________________</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

export default RouteDruckPage;
