import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface AdminCreateOrderDialogProps {
  merchantUserId: string;
  merchantLabel?: string;
  defaultSenderName?: string;
  defaultSenderAddress?: string;
  onCreated?: () => void;
}

const emptyForm = {
  absenderName: "",
  absenderAdresse: "",
  empfaengerName: "",
  empfaengerAdresse: "",
  empfaengerPlz: "",
  empfaengerStadt: "",
  empfaengerEmail: "",
  empfaengerTelefon: "",
  pakete: 1,
  gewicht: 0,
  packageLengthCm: 0,
  packageWidthCm: 0,
  packageHeightCm: 0,
  notizen: "",
};

export function AdminCreateOrderDialog({
  merchantUserId,
  merchantLabel,
  defaultSenderName = "",
  defaultSenderAddress = "",
  onCreated,
}: AdminCreateOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm((prev) => ({
        ...prev,
        absenderName: prev.absenderName || defaultSenderName,
        absenderAdresse: prev.absenderAdresse || defaultSenderAddress,
      }));
    }
  }, [open, defaultSenderName, defaultSenderAddress]);

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.absenderName || !form.empfaengerName || !form.empfaengerStadt) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("orders").insert({
      user_id: merchantUserId,
      auftrags_nr: "",
      absender_name: form.absenderName,
      absender_adresse: form.absenderAdresse,
      empfaenger_name: form.empfaengerName,
      empfaenger_adresse: form.empfaengerAdresse,
      empfaenger_plz: form.empfaengerPlz,
      empfaenger_stadt: form.empfaengerStadt,
      empfaenger_email: form.empfaengerEmail || null,
      empfaenger_telefon: form.empfaengerTelefon || null,
      pakete: form.pakete,
      gewicht: form.gewicht,
      package_length_cm: form.packageLengthCm || null,
      package_width_cm: form.packageWidthCm || null,
      package_height_cm: form.packageHeightCm || null,
      notizen: form.notizen || null,
    });
    setSubmitting(false);
    if (error) {
      console.error(error);
      toast.error("Auftrag konnte nicht angelegt werden");
      return;
    }
    toast.success("Auftrag erfolgreich angelegt");
    setForm(emptyForm);
    setOpen(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Auftrag anlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Auftrag anlegen{merchantLabel ? ` für ${merchantLabel}` : ""}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 pt-2">
          <div className="rounded-lg bg-muted/50 p-3 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Building2 className="h-3.5 w-3.5" />
              Absender
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Name *</Label>
                <Input value={form.absenderName} onChange={(e) => update("absenderName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Adresse</Label>
                <Input value={form.absenderAdresse} onChange={(e) => update("absenderAdresse", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Empfänger</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Name *</Label>
                <Input value={form.empfaengerName} onChange={(e) => update("empfaengerName", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Straße</Label>
                <Input value={form.empfaengerAdresse} onChange={(e) => update("empfaengerAdresse", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">PLZ</Label>
                <Input value={form.empfaengerPlz} onChange={(e) => update("empfaengerPlz", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stadt *</Label>
                <Input value={form.empfaengerStadt} onChange={(e) => update("empfaengerStadt", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">E-Mail</Label>
                <Input type="email" value={form.empfaengerEmail} onChange={(e) => update("empfaengerEmail", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Telefon</Label>
                <Input value={form.empfaengerTelefon} onChange={(e) => update("empfaengerTelefon", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Pakete</Label>
              <Input type="number" min={1} value={form.pakete} onChange={(e) => update("pakete", parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-2">
              <Label>Gewicht (kg)</Label>
              <Input type="number" min={0} step={0.1} value={form.gewicht} onChange={(e) => update("gewicht", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Paketmaße (cm)</Label>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input type="number" min={0} step={0.1} value={form.packageLengthCm} onChange={(e) => update("packageLengthCm", parseFloat(e.target.value) || 0)} placeholder="Länge" />
              <Input type="number" min={0} step={0.1} value={form.packageWidthCm} onChange={(e) => update("packageWidthCm", parseFloat(e.target.value) || 0)} placeholder="Breite" />
              <Input type="number" min={0} step={0.1} value={form.packageHeightCm} onChange={(e) => update("packageHeightCm", parseFloat(e.target.value) || 0)} placeholder="Höhe" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notizen</Label>
            <Textarea value={form.notizen} onChange={(e) => update("notizen", e.target.value)} rows={2} />
          </div>
          <Button type="submit" className="mt-2" disabled={submitting}>
            {submitting ? "Wird angelegt…" : "Auftrag anlegen"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}