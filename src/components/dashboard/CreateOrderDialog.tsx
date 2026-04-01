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
import { Plus, Building2, BookUser } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Order } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CreateOrderDialogProps {
  onSubmit: (order: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">) => void;
}

interface Contact {
  id: string;
  firma_name: string | null;
  ansprechpartner: string;
  email: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  stadt: string | null;
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
  notizen: "",
  saveToAddressBook: false,
};

export function CreateOrderDialog({ onSubmit }: CreateOrderDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [senderDefaults, setSenderDefaults] = useState({ absenderName: "", absenderAdresse: "" });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);

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
        const parts = [data.strasse, data.plz, data.stadt].filter(Boolean);
        const adresse = parts.join(", ");
        setSenderDefaults({ absenderName: name, absenderAdresse: adresse });
      }
      setProfileLoaded(true);
    };
    load();
  }, [user, profileLoaded]);

  // Load address book contacts
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("address_book")
        .select("id, firma_name, ansprechpartner, email, telefon, strasse, plz, stadt")
        .eq("user_id", user.id)
        .order("is_favorite", { ascending: false })
        .order("ansprechpartner", { ascending: true });
      if (data) setContacts(data);
    };
    load();
  }, [user]);

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

  const selectContact = (contact: Contact) => {
    setForm((prev) => ({
      ...prev,
      empfaengerName: contact.firma_name
        ? `${contact.firma_name} – ${contact.ansprechpartner}`
        : contact.ansprechpartner,
      empfaengerAdresse: contact.strasse || "",
      empfaengerPlz: contact.plz || "",
      empfaengerStadt: contact.stadt || "",
      empfaengerEmail: contact.email || "",
      empfaengerTelefon: contact.telefon || "",
    }));
    setContactPopoverOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.absenderName || !form.empfaengerName || !form.empfaengerStadt) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }

    if (form.saveToAddressBook && user) {
      const { error } = await supabase.from("address_book").insert({
        user_id: user.id,
        ansprechpartner: form.empfaengerName,
        strasse: form.empfaengerAdresse || null,
        plz: form.empfaengerPlz || null,
        stadt: form.empfaengerStadt || null,
        email: form.empfaengerEmail || null,
        telefon: form.empfaengerTelefon || null,
      });
      if (error) {
        toast.error("Kontakt konnte nicht gespeichert werden");
      } else {
        // Refresh contacts list
        const { data } = await supabase
          .from("address_book")
          .select("id, firma_name, ansprechpartner, email, telefon, strasse, plz, stadt")
          .eq("user_id", user.id)
          .order("is_favorite", { ascending: false })
          .order("ansprechpartner", { ascending: true });
        if (data) setContacts(data);
      }
    }

    const { saveToAddressBook, ...orderData } = form;
    onSubmit(orderData);
    setForm(emptyForm);
    setOpen(false);
    toast.success("Auftrag erfolgreich angelegt");
  };

  const update = (field: string, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Auftrag
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Empfänger</p>
              {contacts.length > 0 && (
                <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                      <BookUser className="h-3.5 w-3.5" />
                      Aus Adressbuch
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Kontakt suchen…" />
                      <CommandList>
                        <CommandEmpty>Kein Kontakt gefunden</CommandEmpty>
                        <CommandGroup>
                          {contacts.map((c) => (
                            <CommandItem
                              key={c.id}
                              onSelect={() => selectContact(c)}
                              className="flex flex-col items-start gap-0.5"
                            >
                              <span className="font-medium text-sm">{c.ansprechpartner}</span>
                              {c.firma_name && (
                                <span className="text-xs text-muted-foreground">{c.firma_name}</span>
                              )}
                              {c.stadt && (
                                <span className="text-xs text-muted-foreground">
                                  {[c.plz, c.stadt].filter(Boolean).join(" ")}
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
          </div>

          {/* Save to address book */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="saveToAddressBook"
              checked={form.saveToAddressBook}
              onCheckedChange={(checked) => update("saveToAddressBook", !!checked)}
            />
            <Label htmlFor="saveToAddressBook" className="text-sm cursor-pointer">
              Empfänger im Adressbuch speichern
            </Label>
          </div>
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

          {/* Package details */}
          <div className="grid gap-4 sm:grid-cols-3">
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
