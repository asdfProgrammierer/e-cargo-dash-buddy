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
import { Plus, Building2, BookUser, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { sendOrderStatusEmail } from "@/lib/orderEmail";

interface AdminCreateOrderDialogProps {
  merchantUserId?: string;
  merchantLabel?: string;
  defaultSenderName?: string;
  defaultSenderAddress?: string;
  onCreated?: () => void;
}

interface MerchantOption {
  user_id: string;
  label: string;
  senderName: string;
  senderAddress: string;
}

interface AddressBookEntry {
  id: string;
  firma_name: string | null;
  ansprechpartner: string | null;
  email: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  stadt: string | null;
  is_favorite: boolean;
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
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [saveToAddressBook, setSaveToAddressBook] = useState(true);

  const needsMerchantPicker = !merchantUserId;
  const effectiveMerchantId = merchantUserId ?? selectedMerchantId;

  useEffect(() => {
    if (!open || !needsMerchantPicker || merchants.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, firma_name, ansprechpartner, strasse, plz, stadt")
        .eq("approved", true)
        .is("parent_user_id", null)
        .order("firma_name", { ascending: true });
      if (data) {
        setMerchants(
          data.map((p) => ({
            user_id: p.user_id,
            label: p.firma_name?.trim() || p.ansprechpartner?.trim() || "Unbekannter Händler",
            senderName: p.firma_name?.trim() || p.ansprechpartner?.trim() || "",
            senderAddress: [p.strasse, p.plz, p.stadt].filter(Boolean).join(", "),
          })),
        );
      }
    })();
  }, [open, needsMerchantPicker, merchants.length]);

  // Load address book for the effective merchant
  useEffect(() => {
    if (!open || !effectiveMerchantId) {
      setAddressBook([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("address_book")
        .select("id, firma_name, ansprechpartner, email, telefon, strasse, plz, stadt, is_favorite")
        .eq("user_id", effectiveMerchantId)
        .order("is_favorite", { ascending: false })
        .order("firma_name", { ascending: true });
      setAddressBook((data as AddressBookEntry[]) ?? []);
    })();
  }, [open, effectiveMerchantId]);

  // When merchant changes via picker, refresh sender defaults
  useEffect(() => {
    if (!needsMerchantPicker || !selectedMerchantId) return;
    const m = merchants.find((x) => x.user_id === selectedMerchantId);
    if (m) {
      setForm((prev) => ({
        ...prev,
        absenderName: m.senderName,
        absenderAdresse: m.senderAddress,
      }));
    }
  }, [selectedMerchantId, merchants, needsMerchantPicker]);

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

  const pickAddress = (entry: AddressBookEntry) => {
    setSelectedAddressId(entry.id);
    setSaveToAddressBook(false);
    setForm((prev) => ({
      ...prev,
      empfaengerName: entry.firma_name || entry.ansprechpartner || "",
      empfaengerAdresse: entry.strasse || "",
      empfaengerPlz: entry.plz || "",
      empfaengerStadt: entry.stadt || "",
      empfaengerEmail: entry.email || "",
      empfaengerTelefon: entry.telefon || "",
    }));
    setAddressPickerOpen(false);
  };

  const toggleFavorite = async (entry: AddressBookEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !entry.is_favorite;
    const { error } = await supabase
      .from("address_book")
      .update({ is_favorite: newVal })
      .eq("id", entry.id);
    if (error) {
      toast.error("Favorit konnte nicht geändert werden");
      return;
    }
    setAddressBook((prev) =>
      [...prev.map((a) => (a.id === entry.id ? { ...a, is_favorite: newVal } : a))]
        .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || (a.firma_name ?? "").localeCompare(b.firma_name ?? "")),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveMerchantId) {
      toast.error("Bitte einen Händler auswählen");
      return;
    }
    if (!form.absenderName || !form.empfaengerName || !form.empfaengerStadt) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSubmitting(true);
    const { data: inserted, error } = await supabase.from("orders").insert({
      user_id: effectiveMerchantId,
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
    }).select("id, auftrags_nr").single();
    setSubmitting(false);
    if (error) {
      console.error(error);
      toast.error("Auftrag konnte nicht angelegt werden");
      return;
    }
    if (inserted) {
      // Save to address book if it's a new entry and user opted in
      if (saveToAddressBook && !selectedAddressId && form.empfaengerName) {
        void (async () => {
          const { data: newEntry } = await supabase
            .from("address_book")
            .insert({
              user_id: effectiveMerchantId,
              firma_name: form.empfaengerName,
              ansprechpartner: form.empfaengerName,
              strasse: form.empfaengerAdresse || null,
              plz: form.empfaengerPlz || null,
              stadt: form.empfaengerStadt || null,
              email: form.empfaengerEmail || null,
              telefon: form.empfaengerTelefon || null,
            })
            .select("id")
            .single();
          if (newEntry) {
            // No-op; will refetch on next open.
          }
        })();
      }
      void sendOrderStatusEmail({
        orderId: inserted.id as string,
        auftragsNr: inserted.auftrags_nr as string,
        status: "neu",
        empfaengerName: form.empfaengerName,
        empfaengerEmail: form.empfaengerEmail || null,
        empfaengerAdresse: form.empfaengerAdresse,
        empfaengerPlz: form.empfaengerPlz,
        empfaengerStadt: form.empfaengerStadt,
        haendlerUserId: effectiveMerchantId,
      });
      // Auto-geocode so the new order is immediately usable on the map.
      void (async () => {
        try {
          const { data, error } = await supabase.functions.invoke("geocode-address", {
            body: {
              strasse: form.empfaengerAdresse ?? "",
              plz: form.empfaengerPlz ?? "",
              stadt: form.empfaengerStadt ?? "",
            },
          });
          if (!error && data?.lat && data?.lng) {
            await supabase
              .from("orders")
              .update({ lat: data.lat, lng: data.lng, geocoded_at: new Date().toISOString() })
              .eq("id", inserted.id);
          }
        } catch (e) {
          console.warn("auto-geocode after create failed", e);
        }
      })();
    }
    toast.success("Auftrag erfolgreich angelegt");
    setForm(emptyForm);
    setSelectedMerchantId("");
    setSelectedAddressId(null);
    setSaveToAddressBook(true);
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
          {needsMerchantPicker && (
            <div className="space-y-1.5">
              <Label className="text-xs">Händler *</Label>
              <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Händler auswählen…" />
                </SelectTrigger>
                <SelectContent>
                  {merchants.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Empfänger</p>
              {effectiveMerchantId && addressBook.length > 0 && (
                <Popover open={addressPickerOpen} onOpenChange={setAddressPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                      <BookUser className="h-3.5 w-3.5" />
                      Aus Adressbuch ({addressBook.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Adresse suchen…" />
                      <CommandList>
                        <CommandEmpty>Keine Einträge gefunden</CommandEmpty>
                        <CommandGroup>
                          {addressBook.map((entry) => (
                            <CommandItem
                              key={entry.id}
                              value={`${entry.firma_name ?? ""} ${entry.strasse ?? ""} ${entry.plz ?? ""} ${entry.stadt ?? ""}`}
                              onSelect={() => pickAddress(entry)}
                              className="flex items-start gap-2"
                            >
                              <button
                                type="button"
                                onClick={(ev) => toggleFavorite(entry, ev)}
                                className="mt-0.5"
                                aria-label="Favorit umschalten"
                              >
                                <Star
                                  className={`h-3.5 w-3.5 ${entry.is_favorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground"}`}
                                />
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{entry.firma_name || entry.ansprechpartner || "—"}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {[entry.strasse, [entry.plz, entry.stadt].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Name *</Label>
                <Input value={form.empfaengerName} onChange={(e) => { setSelectedAddressId(null); update("empfaengerName", e.target.value); }} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Straße</Label>
                <Input value={form.empfaengerAdresse} onChange={(e) => { setSelectedAddressId(null); update("empfaengerAdresse", e.target.value); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">PLZ</Label>
                <Input value={form.empfaengerPlz} onChange={(e) => { setSelectedAddressId(null); update("empfaengerPlz", e.target.value); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stadt *</Label>
                <Input value={form.empfaengerStadt} onChange={(e) => { setSelectedAddressId(null); update("empfaengerStadt", e.target.value); }} />
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
            {effectiveMerchantId && !selectedAddressId && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={saveToAddressBook}
                  onCheckedChange={(v) => setSaveToAddressBook(v === true)}
                />
                Diese Empfänger-Adresse im Adressbuch des Händlers speichern
              </label>
            )}
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