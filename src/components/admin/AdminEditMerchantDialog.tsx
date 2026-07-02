import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  profile: {
    id: string;
    firma_name: string | null;
    ansprechpartner: string | null;
    strasse: string | null;
    plz: string | null;
    stadt: string | null;
    telefon: string | null;
    paketpreis: number | null;
    is_virtual: boolean;
    pickup_note: string | null;
  };
  onUpdated: (updated: Partial<Props["profile"]>) => void;
}

export function AdminEditMerchantDialog({ profile, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [firmaName, setFirmaName] = useState("");
  const [ansprechpartner, setAnsprechpartner] = useState("");
  const [strasse, setStrasse] = useState("");
  const [plz, setPlz] = useState("");
  const [stadt, setStadt] = useState("");
  const [telefon, setTelefon] = useState("");
  const [paketpreis, setPaketpreis] = useState("");
  const [pickupNote, setPickupNote] = useState("");

  useEffect(() => {
    setFirmaName(profile.firma_name ?? "");
    setAnsprechpartner(profile.ansprechpartner ?? "");
    setStrasse(profile.strasse ?? "");
    setPlz(profile.plz ?? "");
    setStadt(profile.stadt ?? "");
    setTelefon(profile.telefon ?? "");
    setPaketpreis(profile.paketpreis != null ? String(profile.paketpreis) : "");
    setPickupNote(profile.pickup_note ?? "");
  }, [profile, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firmaName.trim()) {
      toast.error("Firmenname ist erforderlich");
      return;
    }

    const numericPrice =
      paketpreis.trim() === ""
        ? null
        : Number(paketpreis.trim().replace(",", "."));
    if (paketpreis.trim() !== "" && (!Number.isFinite(numericPrice) || numericPrice < 0)) {
      toast.error("Ungültiger Paketpreis");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        firma_name: firmaName.trim(),
        ansprechpartner: ansprechpartner.trim() || null,
        strasse: strasse.trim() || null,
        plz: plz.trim() || null,
        stadt: stadt.trim() || null,
        telefon: telefon.trim() || null,
        paketpreis: numericPrice,
        pickup_note: pickupNote.trim() || null,
      })
      .eq("id", profile.id);
    setSaving(false);

    if (error) {
      toast.error("Fehler beim Speichern: " + error.message);
      return;
    }

    toast.success("Händlerdaten aktualisiert");
    onUpdated({
      firma_name: firmaName.trim(),
      ansprechpartner: ansprechpartner.trim() || null,
      strasse: strasse.trim() || null,
      plz: plz.trim() || null,
      stadt: stadt.trim() || null,
      telefon: telefon.trim() || null,
      paketpreis: numericPrice,
      pickup_note: pickupNote.trim() || null,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Pencil className="h-4 w-4" />
          Bearbeiten
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Händler bearbeiten</DialogTitle>
          <DialogDescription>
            {profile.is_virtual
              ? "Stammdaten des fiktiven Händlers aktualisieren."
              : "Stammdaten des Händlers aktualisieren."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Firmenname *</Label>
            <Input value={firmaName} onChange={(e) => setFirmaName(e.target.value)} placeholder="z.B. Thalia" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ansprechpartner</Label>
            <Input value={ansprechpartner} onChange={(e) => setAnsprechpartner(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Straße</Label>
            <Input value={strasse} onChange={(e) => setStrasse(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">PLZ</Label>
              <Input value={plz} onChange={(e) => setPlz(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Stadt</Label>
              <Input value={stadt} onChange={(e) => setStadt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Telefon</Label>
              <Input value={telefon} onChange={(e) => setTelefon(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Paketpreis (€)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={paketpreis}
                onChange={(e) => setPaketpreis(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Notiz für Abhol-Aufträge</Label>
            <Textarea
              value={pickupNote}
              onChange={(e) => setPickupNote(e.target.value)}
              placeholder="z. B. Abholung, Hinweis: Türcode 123456"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Wird als Notiz in automatisch erstellte Abhol-Aufträge übernommen.
            </p>
          </div>
          <Button type="submit" disabled={saving} className="mt-2">
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
