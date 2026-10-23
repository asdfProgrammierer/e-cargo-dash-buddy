import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const PRICE_FIELDS = [
  { key: "paketpreis", label: "Paketpreis (€)", short: "Paket", hint: "1× pro Auftrag" },
  { key: "stopppreis", label: "Stopppreis (€)", short: "Stopp", hint: "jeder angefahrene Stopp" },
  { key: "stundenpreis", label: "Stundenpreis (€/h)", short: "Stunde", hint: "nur exklusive Touren" },
  { key: "tagespauschale", label: "Tagespauschale (€)", short: "Tag", hint: "1× pro Einsatztag" },
  { key: "grundbeitrag_monat", label: "Grundbeitrag (€/Monat)", short: "Grundbeitrag", hint: "monatliche Pauschale" },
] as const;
export type PriceKey = (typeof PRICE_FIELDS)[number]["key"];
export type MerchantPriceValues = Partial<Record<PriceKey, number | null>>;

export function MerchantPricesCard({ profileId, values, onSaved }: {
  profileId: string;
  values: MerchantPriceValues;
  onSaved: (v: Record<PriceKey, number | null>) => void;
}) {
  const [form, setForm] = useState<Record<PriceKey, string>>({} as Record<PriceKey, string>);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm(Object.fromEntries(PRICE_FIELDS.map(({ key }) => [key, values[key] != null ? String(values[key]) : ""])) as Record<PriceKey, string>);
  }, [values.paketpreis, values.stopppreis, values.stundenpreis, values.tagespauschale, values.grundbeitrag_monat]);

  const save = async () => {
    const parsed = {} as Record<PriceKey, number | null>;
    for (const { key, label } of PRICE_FIELDS) {
      const raw = (form[key] ?? "").trim();
      const n = raw === "" ? null : Number(raw.replace(",", "."));
      if (n !== null && (!Number.isFinite(n) || n < 0)) { toast.error(`Ungültiger Wert: ${label}`); return; }
      parsed[key] = n;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update(parsed).eq("id", profileId);
    setSaving(false);
    if (error) { toast.error("Preise konnten nicht gespeichert werden: " + error.message); return; }
    onSaved(parsed);
    toast.success("Preise gespeichert");
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div>
        <p className="font-medium text-sm">Preise & Konditionen</p>
        <p className="text-xs text-muted-foreground">Grundlage für Rechnung und Kosten- & Ertragsanalyse. Leer = wird nicht berechnet.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRICE_FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input type="number" min="0" step="0.01" value={form[key] ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={saving}>{saving ? "Speichern..." : "Preise speichern"}</Button>
    </div>
  );
}
