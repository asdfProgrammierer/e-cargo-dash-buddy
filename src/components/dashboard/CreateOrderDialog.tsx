import { useState, useEffect } from "react";
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
import { Order } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface CreateOrderDialogProps {
  onSubmit: (order: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">) => void;
}

const emptyForm = {
  absenderName: "",
  absenderAdresse: "",
  empfaengerName: "",
  empfaengerAdresse: "",
  empfaengerStadt: "",
  pakete: 1,
  gewicht: 0,
  notizen: "",
};

export function CreateOrderDialog({ onSubmit }: CreateOrderDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [senderDefaults, setSenderDefaults] = useState({ absenderName: "", absenderAdresse: "" });

  // Load profile data once
  useEffect(() => {
    if (!user || profileLoaded) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        const name = data.firma_name || data.ansprechpartner || "";
        const parts = [(data as any).strasse, (data as any).plz, (data as any).stadt].filter(Boolean);
        const adresse = parts.join(", ");
        setSenderDefaults({ absenderName: name, absenderAdresse: adresse });
      }
      setProfileLoaded(true);
    };
    load();
  }, [user, profileLoaded]);

  // Pre-fill sender when dialog opens
  useEffect(() => {
    if (open && profileLoaded) {
      setForm((prev) => ({
        ...prev,
        absenderName: prev.absenderName || senderDefaults.absenderName,
        absenderAdresse: prev.absenderAdresse || senderDefaults.absenderAdresse,
      }));
    }
  }, [open, profileLoaded, senderDefaults]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.absenderName || !form.empfaengerName || !form.empfaengerStadt) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    onSubmit(form);
    setForm(emptyForm);
    setOpen(false);
    toast.success("Auftrag erfolgreich angelegt");
  };

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Auftrag
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Neuen Auftrag anlegen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 pt-2">
          {/* Sender – pre-filled from profile */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Building2 className="h-3.5 w-3.5" />
              Absender (aus Profil)
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

          {/* Recipient */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Empfänger Name *</Label>
              <Input value={form.empfaengerName} onChange={(e) => update("empfaengerName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Empfänger Adresse</Label>
              <Input value={form.empfaengerAdresse} onChange={(e) => update("empfaengerAdresse", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Stadt *</Label>
              <Input value={form.empfaengerStadt} onChange={(e) => update("empfaengerStadt", e.target.value)} />
            </div>
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
            <Label>Notizen</Label>
            <Textarea value={form.notizen} onChange={(e) => update("notizen", e.target.value)} rows={2} />
          </div>
          <Button type="submit" className="mt-2">
            Auftrag anlegen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
