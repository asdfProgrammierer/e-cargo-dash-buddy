import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Package, Plus, Trash2 } from "lucide-react";

interface DhlProduct {
  code: string;
  label: string;
  billing_number: string | null;
  sort_order: number;
}

interface Tier {
  id?: string;
  product_code: string;
  user_id: string | null;
  max_weight_kg: number;
  price_netto: number;
}

interface Props {
  /** Wenn gesetzt: Override-Modus für diesen Händler. Sonst globale Defaults. */
  merchantUserId?: string;
}

export function DhlPricingTable({ merchantUserId }: Props) {
  const [products, setProducts] = useState<DhlProduct[]>([]);
  const [globalTiers, setGlobalTiers] = useState<Tier[]>([]);
  const [merchantTiers, setMerchantTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, [merchantUserId]);

  async function load() {
    setLoading(true);
    const [{ data: prod }, { data: tiers }] = await Promise.all([
      (supabase as any).from("dhl_products").select("*").order("sort_order"),
      (supabase as any).from("dhl_price_tiers").select("*").order("max_weight_kg", { ascending: true }),
    ]);
    setProducts((prod ?? []) as DhlProduct[]);
    const all = (tiers ?? []) as Tier[];
    setGlobalTiers(all.filter((t) => t.user_id === null));
    setMerchantTiers(merchantUserId ? all.filter((t) => t.user_id === merchantUserId) : []);
    setLoading(false);
  }

  async function saveTier(t: Tier) {
    if (!isFinite(t.max_weight_kg) || t.max_weight_kg <= 0) { toast.error("Ungültiges Gewicht"); return; }
    if (!isFinite(t.price_netto) || t.price_netto < 0) { toast.error("Ungültiger Preis"); return; }
    const payload = {
      product_code: t.product_code,
      user_id: t.user_id,
      max_weight_kg: t.max_weight_kg,
      price_netto: t.price_netto,
    };
    if (t.id) {
      const { error } = await (supabase as any).from("dhl_price_tiers").update(payload).eq("id", t.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await (supabase as any).from("dhl_price_tiers").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Staffel gespeichert");
    await load();
  }

  async function deleteTier(id: string) {
    const { error } = await (supabase as any).from("dhl_price_tiers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Staffel gelöscht");
    await load();
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lade DHL-Preise…</div>;
  }

  return (
    <div className="space-y-4">
      {products.map((p) => {
        const tiers = (merchantUserId ? merchantTiers : globalTiers)
          .filter((t) => t.product_code === p.code)
          .sort((a, b) => a.max_weight_kg - b.max_weight_kg);
        const globalForProduct = globalTiers
          .filter((t) => t.product_code === p.code)
          .sort((a, b) => a.max_weight_kg - b.max_weight_kg);

        return (
          <div key={p.code} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {p.code} · EKP {p.billing_number ?? "—"}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => saveTier({
                product_code: p.code,
                user_id: merchantUserId ?? null,
                max_weight_kg: tiers.length ? Math.max(...tiers.map((t) => t.max_weight_kg)) + 1 : 1,
                price_netto: 0,
              })}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Staffel
              </Button>
            </div>

            {tiers.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                {merchantUserId
                  ? `Keine individuellen Staffeln – globale Defaults werden verwendet (${globalForProduct.length} Stufen).`
                  : "Noch keine Staffeln definiert."}
              </p>
            )}

            {tiers.length > 0 && (
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-medium text-muted-foreground uppercase">
                  <div className="col-span-5">bis Gewicht (kg)</div>
                  <div className="col-span-5">Preis netto (€)</div>
                  <div className="col-span-2"></div>
                </div>
                {tiers.map((t) => (
                  <TierRow key={t.id} tier={t} onSave={saveTier} onDelete={deleteTier} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Die niedrigste Staffel, deren Maximalgewicht das Auftragsgewicht abdeckt, wird verwendet.
        {merchantUserId && " Händler-Staffeln überschreiben die globalen Defaults für dieses Produkt vollständig."}
      </p>
    </div>
  );
}

function TierRow({ tier, onSave, onDelete }: { tier: Tier; onSave: (t: Tier) => void; onDelete: (id: string) => void }) {
  const [w, setW] = useState(String(tier.max_weight_kg));
  const [p, setP] = useState(tier.price_netto.toFixed(2));
  const dirty = w !== String(tier.max_weight_kg) || p !== tier.price_netto.toFixed(2);

  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <Input className="col-span-5 h-8" type="text" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
      <Input className="col-span-5 h-8" type="text" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
      <div className="col-span-2 flex gap-1 justify-end">
        <Button size="sm" variant="outline" disabled={!dirty}
          onClick={() => onSave({ ...tier, max_weight_kg: Number(w.replace(",", ".")), price_netto: Number(p.replace(",", ".")) })}>
          OK
        </Button>
        {tier.id && (
          <Button size="sm" variant="ghost" onClick={() => onDelete(tier.id!)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}