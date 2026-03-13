import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Star, Trash2, Pencil, Search, Building2, Phone, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Contact {
  id: string;
  firma_name: string | null;
  ansprechpartner: string;
  email: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  stadt: string | null;
  notizen: string | null;
  is_favorite: boolean;
}

const emptyForm = {
  firma_name: "",
  ansprechpartner: "",
  email: "",
  telefon: "",
  strasse: "",
  plz: "",
  stadt: "",
  notizen: "",
  is_favorite: false,
};

const AdressbuchPage = () => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const fetchContacts = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("address_book")
      .select("*")
      .eq("user_id", user.id)
      .order("is_favorite", { ascending: false })
      .order("ansprechpartner", { ascending: true });
    if (error) {
      toast.error("Fehler beim Laden der Kontakte");
    } else {
      setContacts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
  }, [user]);

  const handleSave = async () => {
    if (!user || !form.ansprechpartner.trim()) {
      toast.error("Ansprechpartner ist erforderlich");
      return;
    }

    const payload = {
      user_id: user.id,
      firma_name: form.firma_name || null,
      ansprechpartner: form.ansprechpartner,
      email: form.email || null,
      telefon: form.telefon || null,
      strasse: form.strasse || null,
      plz: form.plz || null,
      stadt: form.stadt || null,
      notizen: form.notizen || null,
      is_favorite: form.is_favorite,
    };

    if (editingId) {
      const { error } = await supabase.from("address_book").update(payload).eq("id", editingId);
      if (error) { toast.error("Fehler beim Aktualisieren"); return; }
      toast.success("Kontakt aktualisiert");
    } else {
      const { error } = await supabase.from("address_book").insert(payload);
      if (error) { toast.error("Fehler beim Speichern"); return; }
      toast.success("Kontakt gespeichert");
    }

    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(false);
    fetchContacts();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("address_book").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Kontakt gelöscht");
    fetchContacts();
  };

  const toggleFavorite = async (contact: Contact) => {
    await supabase.from("address_book").update({ is_favorite: !contact.is_favorite }).eq("id", contact.id);
    fetchContacts();
  };

  const openEdit = (c: Contact) => {
    setForm({
      firma_name: c.firma_name || "",
      ansprechpartner: c.ansprechpartner,
      email: c.email || "",
      telefon: c.telefon || "",
      strasse: c.strasse || "",
      plz: c.plz || "",
      stadt: c.stadt || "",
      notizen: c.notizen || "",
      is_favorite: c.is_favorite,
    });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const filtered = contacts.filter((c) => {
    if (showFavoritesOnly && !c.is_favorite) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.ansprechpartner.toLowerCase().includes(s) ||
      (c.firma_name?.toLowerCase().includes(s)) ||
      (c.stadt?.toLowerCase().includes(s)) ||
      (c.email?.toLowerCase().includes(s))
    );
  });

  return (
    <DashboardLayout title="Adressbuch">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Kontakt suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Button
              variant={showFavoritesOnly ? "default" : "ghost"}
              size="sm"
              className="h-9"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            >
              <Star className="mr-1 h-4 w-4" />
              Favoriten
            </Button>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9" onClick={openNew}>
                <Plus className="mr-1 h-4 w-4" />
                Neuer Kontakt
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Kontakt bearbeiten" : "Neuer Kontakt"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Ansprechpartner *</Label>
                    <Input value={form.ansprechpartner} onChange={(e) => setForm({ ...form, ansprechpartner: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Firma</Label>
                    <Input value={form.firma_name} onChange={(e) => setForm({ ...form, firma_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>E-Mail</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Straße</Label>
                    <Input value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.target.value })} />
                  </div>
                  <div>
                    <Label>PLZ</Label>
                    <Input value={form.plz} onChange={(e) => setForm({ ...form, plz: e.target.value })} />
                  </div>
                  <div>
                    <Label>Stadt</Label>
                    <Input value={form.stadt} onChange={(e) => setForm({ ...form, stadt: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Notizen</Label>
                    <Textarea value={form.notizen} onChange={(e) => setForm({ ...form, notizen: e.target.value })} rows={2} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, is_favorite: !form.is_favorite })}>
                    <Star className={`mr-1 h-4 w-4 ${form.is_favorite ? "fill-warning text-warning" : ""}`} />
                    {form.is_favorite ? "Favorit" : "Als Favorit markieren"}
                  </Button>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
                  <Button onClick={handleSave}>{editingId ? "Speichern" : "Erstellen"}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <p className="text-muted-foreground">Keine Kontakte gefunden</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <Card key={c.id} className="relative group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{c.ansprechpartner}</CardTitle>
                      {c.firma_name && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" />
                          {c.firma_name}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {c.is_favorite && <Badge variant="secondary" className="bg-warning/10 text-warning border-0 text-xs">Favorit</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {c.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {c.telefon && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {c.telefon}
                    </div>
                  )}
                  {(c.strasse || c.stadt) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{[c.strasse, [c.plz, c.stadt].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span>
                    </div>
                  )}
                  <div className="flex gap-1 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleFavorite(c)}>
                      <Star className={`h-3.5 w-3.5 ${c.is_favorite ? "fill-warning text-warning" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdressbuchPage;
