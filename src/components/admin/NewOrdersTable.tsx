import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, RefreshCw, AlertCircle } from "lucide-react";

interface OrderRow {
  id: string; auftrags_nr: string; empfaenger_name: string;
  empfaenger_adresse: string | null; empfaenger_plz: string | null; empfaenger_stadt: string;
  pakete: number; gewicht: number;
  lat: number | null; lng: number | null;
  created_at: string;
}

interface Props {
  /** ID of currently selected route (target for "Hinzufügen"). */
  routeId: string | null;
  /** Bumped by parent to trigger reload after route changes. */
  refreshKey?: number;
  /** Called after orders were assigned, so the parent can refresh its route. */
  onAssigned?: () => void;
}

export function NewOrdersTable({ routeId, refreshKey, onAssigned }: Props) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, pakete, gewicht, lat, lng, created_at")
      .eq("status", "neu")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { toast.error("Bestellungen konnten nicht geladen werden"); setLoading(false); return; }
    setOrders((data as OrderRow[]) ?? []);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, [refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      o.auftrags_nr.toLowerCase().includes(q) ||
      o.empfaenger_name.toLowerCase().includes(q) ||
      (o.empfaenger_plz ?? "").includes(q) ||
      o.empfaenger_stadt.toLowerCase().includes(q),
    );
  }, [orders, search]);

  const toggleAll = (checked: boolean) => {
    if (!checked) { setSelected(new Set()); return; }
    // Only geocoded orders can actually be added to the route
    setSelected(new Set(filtered.filter((o) => o.lat != null && o.lng != null).map((o) => o.id)));
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const addToRoute = async () => {
    if (!routeId) { toast.error("Bitte links eine Route auswählen"); return; }
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setAdding(true);

    // Determine next position for the route
    const { data: existing } = await supabase
      .from("route_stops")
      .select("position")
      .eq("route_id", routeId)
      .order("position", { ascending: false })
      .limit(1);
    const startPos = ((existing?.[0]?.position as number | undefined) ?? 0) + 1;

    const rows = ids.map((order_id, i) => ({ route_id: routeId, order_id, position: startPos + i }));
    const { error } = await supabase.from("route_stops").insert(rows);
    if (error) { toast.error("Stops konnten nicht hinzugefügt werden"); setAdding(false); return; }

    // Move orders to "in_bearbeitung"
    await supabase.from("orders").update({ status: "in_bearbeitung" }).in("id", ids);

    toast.success(`${ids.length} Sendung(en) zur Route hinzugefügt`);
    setAdding(false);
    setSelected(new Set());
    onAssigned?.();
    load();
  };

  const allChecked = filtered.length > 0 && filtered.every((o) => selected.has(o.id) || o.lat == null);

  return (
    <Card className="shadow-card">
      <div className="flex items-center justify-between gap-2 px-4 h-11 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-body font-medium">Neue Sendungen</span>
          <Badge variant="secondary" className="text-[10px] tabular-nums">{orders.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche…"
              className="h-8 pl-7 w-44 text-caption"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Aktualisieren">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={addToRoute}
            disabled={!routeId || selected.size === 0 || adding}
            title={!routeId ? "Bitte zuerst Route wählen" : ""}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Zur Route ({selected.size})
          </Button>
        </div>
      </div>

      <CardContent className="p-0">
        <ScrollArea className="h-[34vh]">
          <table className="w-full text-caption">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-3 py-2 text-left w-8">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(c) => toggleAll(!!c)}
                  />
                </th>
                <th className="px-2 py-2 text-left font-medium">Auftrag</th>
                <th className="px-2 py-2 text-left font-medium">Empfänger</th>
                <th className="px-2 py-2 text-left font-medium">PLZ / Stadt</th>
                <th className="px-2 py-2 text-right font-medium">Pakete</th>
                <th className="px-2 py-2 text-right font-medium">Gewicht</th>
                <th className="px-2 py-2 text-left font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Lade…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Keine neuen Sendungen.
                </td></tr>
              ) : (
                filtered.map((o) => {
                  const noGeo = o.lat == null || o.lng == null;
                  const isSelected = selected.has(o.id);
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-border/40 transition-colors duration-fast ease-fast-out hover:bg-surface-muted ${isSelected ? "bg-active-surface" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={isSelected}
                          disabled={noGeo}
                          onCheckedChange={(c) => toggleOne(o.id, !!c)}
                        />
                      </td>
                      <td className="px-2 py-2 tabular-nums font-medium">{o.auftrags_nr}</td>
                      <td className="px-2 py-2 truncate max-w-[180px]">{o.empfaenger_name}</td>
                      <td className="px-2 py-2 tabular-nums truncate max-w-[180px]">
                        {o.empfaenger_plz} {o.empfaenger_stadt}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{o.pakete}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{Number(o.gewicht).toFixed(1)} kg</td>
                      <td className="px-2 py-2">
                        {noGeo && (
                          <span title="Keine Koordinaten — bitte erst geocodieren">
                            <AlertCircle className="h-3.5 w-3.5 text-warning" />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}