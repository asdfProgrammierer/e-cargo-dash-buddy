import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sumCostItems } from "@/lib/vehicleCosts";

export interface CostItem { id: string; bezeichnung: string; intervall: "monat" | "jahr" | "km"; betrag: number }

const FIX_PRESETS = ["Leasing / Finanzierung", "Abschreibung", "Versicherung", "Kfz-Steuer", "Stellplatz / Garage", "GPS / Telematik", "Akku-Miete"];
const KM_PRESETS = ["Strom / Energie", "Reifen", "Bremsen", "Kette / Antrieb", "Allgemeiner Verschleiß"];
const intervallLabel = { monat: "€ / Monat", jahr: "€ / Jahr", km: "€ / km" };
const eur = (n: number, d = 2) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d });

export function VehicleCostItems({ vehicleId, items, onChange }: { vehicleId: string; items: CostItem[]; onChange: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Partial<CostItem>>>({});
  const fixItems = items.filter((i) => i.intervall !== "km");
  const kmItems = items.filter((i) => i.intervall === "km");
  const { fixPerMonth, costPerKm } = sumCostItems(items);

  const add = async (bezeichnung: string, intervall: CostItem["intervall"]) => {
    const { error } = await supabase.from("vehicle_cost_items").insert({ vehicle_id: vehicleId, bezeichnung, intervall, betrag: 0, sort_order: items.length });
    if (error) return toast.error("Konnte Position nicht anlegen");
    onChange();
  };
  const save = async (it: CostItem) => {
    const d = drafts[it.id];
    if (!d) return;
    const betrag = d.betrag !== undefined ? Number(String(d.betrag).replace(",", ".")) : it.betrag;
    if (!Number.isFinite(betrag) || betrag < 0) return toast.error("Betrag muss 0 oder größer sein");
    const bez = (d.bezeichnung ?? it.bezeichnung).trim();
    if (!bez) return toast.error("Bezeichnung fehlt");
    const { error } = await supabase.from("vehicle_cost_items").update({ bezeichnung: bez, betrag, intervall: d.intervall ?? it.intervall }).eq("id", it.id);
    if (error) return toast.error("Speichern fehlgeschlagen");
    setDrafts((p) => { const n = { ...p }; delete n[it.id]; return n; });
    onChange();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("vehicle_cost_items").delete().eq("id", id);
    if (error) return toast.error("Löschen fehlgeschlagen");
    onChange();
  };

  const renderRow = (it: CostItem, km: boolean) => {
    const d = drafts[it.id] ?? {};
    const set = (patch: Partial<CostItem>) => setDrafts((p) => ({ ...p, [it.id]: { ...p[it.id], ...patch } }));
    return (
      <div key={it.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <Input className="flex-1 min-w-40" value={d.bezeichnung ?? it.bezeichnung} onChange={(e) => set({ bezeichnung: e.target.value })} onBlur={() => save(it)} />
        <Input className="w-28" inputMode="decimal" value={d.betrag !== undefined ? String(d.betrag) : String(it.betrag)} onChange={(e) => set({ betrag: e.target.value as any })} onBlur={() => save(it)} />
        {km ? (
          <span className="w-28 text-sm text-muted-foreground">€ / km</span>
        ) : (
          <Select value={it.intervall} onValueChange={async (v) => { const { error } = await supabase.from("vehicle_cost_items").update({ intervall: v }).eq("id", it.id); if (error) toast.error("Speichern fehlgeschlagen"); onChange(); }}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="monat">€ / Monat</SelectItem><SelectItem value="jahr">€ / Jahr</SelectItem></SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="icon" aria-label="Position löschen" onClick={() => remove(it.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    );
  };

  const renderSection = (title: string, list: CostItem[], km: boolean, presets: string[], total: string) => {
    const unused = presets.filter((p) => !list.some((i) => i.bezeichnung === p));
    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="font-semibold text-primary">{total}</span>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Positionen.</p>}
          {list.map((it) => renderRow(it, km))}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {unused.map((p) => (
              <Button key={p} variant="outline" size="sm" onClick={() => add(p, km ? "km" : "monat")}><Plus className="h-3 w-3 mr-1" />{p}</Button>
            ))}
            <Button variant="secondary" size="sm" onClick={() => add("Eigene Position", km ? "km" : "monat")}><Plus className="h-3 w-3 mr-1" />Eigene Position</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {renderSection("Fixkosten", fixItems, false, FIX_PRESETS, `${eur(fixPerMonth)} / Monat`)}
      {renderSection("Variable Kosten", kmItems, true, KM_PRESETS, `${eur(costPerKm, 3)} / km`)}
      <p className="text-xs text-muted-foreground lg:col-span-2">Jahresbeträge werden durch 12 geteilt. Änderungen werden beim Verlassen des Feldes gespeichert. Wartungen mit Kosten aus dem Wartungsplan kommen automatisch dazu.</p>
    </div>
  );
}

export { intervallLabel };
