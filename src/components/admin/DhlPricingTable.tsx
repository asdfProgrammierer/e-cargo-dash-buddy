import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Package } from "lucide-react";

interface DhlProduct {
  code: string;
  label: string;
  billing_number: string | null;
  sort_order: number;
}

interface PricingRow {
  product_code: string;
  user_id: string | null;
  price_netto: number;
}

interface Props {
  /** When set, edits are saved as merchant overrides for that user_id; defaults editable too. */
  merchantUserId?: string;
  /** When true, lets admin edit global default prices. */
  editGlobal?: boolean;
}

export function DhlPricingTable({ merchantUserId, editGlobal = false }: Props) {
  const [products, setProducts] = useState<DhlProduct[]>([]);
  const [globals, setGlobals] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [merchantUserId]);

  async function load() {
    setLoading(true);
    const [{ data: prod }, { data: prices }] = await Promise.all([
      (supabase as any).from("dhl_products").select("*").order("sort_order"),
      (supabase as any).from("dhl_pricing").select("product_code,user_id,price_netto"),
    ]);
    setProducts((prod ?? []) as DhlProduct[]);
    const g: Record<string, number> = {};
    const o: Record<string, number | null> = {};
    for (const r of (prices ?? []) as PricingRow[]) {
      if (r.user_id === null) g[r.product_code] = Number(r.price_netto);
      else if (merchantUserId && r.user_id === merchantUserId) o[r.product_code] = Number(r.price_netto);
    }
    setGlobals(g);
    setOverrides(o);
    setDrafts({});
    setLoading(false);
  }

  async function saveRow(code: string, kind: "global" | "override") {
    const raw = drafts[`${kind}:${code}`];
    if (raw === undefined) return;
    const value = Number(raw.replace(",", "."));
    if (!isFinite(value) || value < 0) { toast.error("Ungültiger Preis"); return; }
    setSaving(`${kind}:${code}`);
    const userId = kind === "global" ? null : merchantUserId!;
    // upsert by composite key
    const { error } = await (supabase as any)
      .from("dhl_pricing")
      .upsert(
        { product_code: code, user_id: userId, price_netto: value },
        { onConflict: userId === null ? "product_code" : "product_code,user_id" } as any,
      );
    setSaving(null);
    if (error) {
      // fallback manual update if upsert conflict spec fails
      const q = (supabase as any).from("dhl_pricing");
      const { data: existing } = userId === null
        ? await q.select("id").eq("product_code", code).is("user_id", null).maybeSingle()
        : await q.select("id").eq("product_code", code).eq("user_id", userId).maybeSingle();
      if (existing?.id) {
        await (supabase as any).from("dhl_pricing").update({ price_netto: value }).eq("id", existing.id);
      } else {
        await (supabase as any).from("dhl_pricing").insert({ product_code: code, user_id: userId, price_netto: value });
      }
    }
    toast.success("Preis gespeichert");
    await load();
  }

  async function removeOverride(code: string) {
    if (!merchantUserId) return;
    setSaving(`override:${code}`);
    await (supabase as any).from("dhl_pricing")
      .delete().eq("product_code", code).eq("user_id", merchantUserId);
    setSaving(null);
    toast.success("Händler-Preis entfernt – globaler Default gilt");
    await load();
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lade DHL-Preise…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-2 px-3 text-xs font-medium text-muted-foreground">
        <div className="col-span-5">Produkt</div>
        <div className="col-span-3">EKP</div>
        <div className="col-span-2 text-right">Default €</div>
        <div className="col-span-2 text-right">{merchantUserId ? "Override €" : ""}</div>
      </div>
      {products.map((p) => {
        const gKey = `global:${p.code}`;
        const oKey = `override:${p.code}`;
        const gVal = drafts[gKey] ?? (globals[p.code]?.toFixed(2) ?? "0.00");
        const oVal = drafts[oKey] ?? (overrides[p.code]?.toFixed(2) ?? "");
        return (
          <div key={p.code} className="grid grid-cols-12 gap-2 items-center rounded-lg border border-border p-3">
            <div className="col-span-5 flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{p.code}</p>
              </div>
            </div>
            <div className="col-span-3 text-xs font-mono text-muted-foreground">
              {p.billing_number ?? "—"}
            </div>
            <div className="col-span-2 flex items-center justify-end gap-1">
              {editGlobal ? (
                <>
                  <Input
                    type="text" inputMode="decimal" className="h-8 w-20 text-right"
                    value={gVal}
                    onChange={(e) => setDrafts((d) => ({ ...d, [gKey]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" disabled={saving === gKey || drafts[gKey] === undefined}
                    onClick={() => saveRow(p.code, "global")}>OK</Button>
                </>
              ) : (
                <span className="text-sm font-mono">{(globals[p.code] ?? 0).toFixed(2)}</span>
              )}
            </div>
            <div className="col-span-2 flex items-center justify-end gap-1">
              {merchantUserId && (
                <>
                  <Input
                    type="text" inputMode="decimal" className="h-8 w-20 text-right"
                    placeholder={(globals[p.code] ?? 0).toFixed(2)}
                    value={oVal}
                    onChange={(e) => setDrafts((d) => ({ ...d, [oKey]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" disabled={saving === oKey || drafts[oKey] === undefined}
                    onClick={() => saveRow(p.code, "override")}>OK</Button>
                  {overrides[p.code] !== undefined && (
                    <Button size="sm" variant="ghost" onClick={() => removeOverride(p.code)} title="Override entfernen">×</Button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground px-1">
        Default = globaler Preis für alle Händler. Override = individueller Händler-Preis (überschreibt Default für diesen Händler).
      </p>
    </div>
  );
}