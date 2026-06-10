import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onCreated?: () => void;
}

const empty = {
  firma_name: "",
  merchant_code: "",
  ansprechpartner: "",
  strasse: "",
  plz: "",
  stadt: "",
  telefon: "",
  paketpreis: "",
};

export function AdminVirtualMerchantDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const update = (k: keyof typeof empty, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.merchant_code.trim().toUpperCase();
    if (!form.firma_name.trim()) {
      toast.error("Firmenname ist erforderlich");
      return;
    }
    if (!/^[A-Z0-9]{3}$/.test(code)) {
      toast.error("Händlercode muss genau 3 Zeichen haben (A-Z, 0-9)");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-virtual-merchant", {
      body: {
        firma_name: form.firma_name.trim(),
        merchant_code: code,
        ansprechpartner: form.ansprechpartner.trim() || null,
        strasse: form.strasse.trim() || null,
        plz: form.plz.trim() || null,
        stadt: form.stadt.trim() || null,
        telefon: form.telefon.trim() || null,
        paketpreis: form.paketpreis.trim() || null,
      },
    });
    setSaving(false);
    const errMsg = (data as { error?: string } | null)?.error ?? error?.message;
    if (errMsg) {
      toast.error(errMsg);
      return;
    }
    toast.success(`Fiktiver Händler "${form.firma_name}" angelegt`);
    setForm(empty);
    setOpen(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Fiktiven Händler anlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fiktiven Händler anlegen</DialogTitle>
          <DialogDescription>
            Für Großkunden ohne eigenen Login (z.B. Thalia). Aufträge werden anschließend per Excel-Import oder manuell für diesen Händler erfasst.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Firmenname *</Label>
            <Input value={form.firma_name} onChange={(e) => update("firma_name", e.target.value)} placeholder="z.B. Thalia" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Händlercode * (3 Zeichen)</Label>
            <Input
              value={form.merchant_code}
              onChange={(e) => update("merchant_code", e.target.value.toUpperCase().slice(0, 3))}
              placeholder="z.B. THA"
              maxLength={3}
              className="uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ansprechpartner</Label>
            <Input value={form.ansprechpartner} onChange={(e) => update("ansprechpartner", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Straße</Label>
            <Input value={form.strasse} onChange={(e) => update("strasse", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">PLZ</Label>
              <Input value={form.plz} onChange={(e) => update("plz", e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Stadt</Label>
              <Input value={form.stadt} onChange={(e) => update("stadt", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Telefon</Label>
              <Input value={form.telefon} onChange={(e) => update("telefon", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Paketpreis (€)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.paketpreis}
                onChange={(e) => update("paketpreis", e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="mt-2">
            {saving ? "Wird angelegt…" : "Händler anlegen"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}