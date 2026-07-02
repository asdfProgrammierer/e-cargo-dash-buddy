import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, Plus, Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SubAccount {
  id: string;
  user_id: string;
  ansprechpartner: string | null;
  email: string | null;
  created_at: string;
}

const MAX = 2;

export function SubAccountsCard() {
  const [accounts, setAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-sub-accounts", {
      body: { action: "list" },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Sub-Accounts konnten nicht geladen werden");
    } else {
      setAccounts((data as any).subAccounts ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      toast.error("Bitte Name, E-Mail und Passwort (mind. 8 Zeichen) angeben");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("manage-sub-accounts", {
      body: { action: "create", name: form.name.trim(), email: form.email.trim(), password: form.password },
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Sub-Account konnte nicht erstellt werden");
      return;
    }
    toast.success("Sub-Account erstellt");
    setOpen(false);
    setForm({ name: "", email: "", password: "" });
    load();
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Diesen Sub-Account wirklich löschen?")) return;
    setDeletingId(userId);
    const { data, error } = await supabase.functions.invoke("manage-sub-accounts", {
      body: { action: "delete", user_id: userId },
    });
    setDeletingId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Löschen fehlgeschlagen");
      return;
    }
    toast.success("Sub-Account gelöscht");
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Sub-Accounts
        </CardTitle>
        <CardDescription>
          Bis zu {MAX} Mitarbeiter-Konten – sie sehen und erstellen die gleichen Aufträge wie dein Hauptkonto, können aber keine Profil- oder Shop-Einstellungen ändern.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Sub-Accounts angelegt.</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{a.ansprechpartner || "–"}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(a.user_id)}
                  disabled={deletingId === a.user_id}
                >
                  {deletingId === a.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={accounts.length >= MAX}>
              <Plus className="mr-2 h-4 w-4" />
              Sub-Account hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuen Sub-Account anlegen</DialogTitle>
              <DialogDescription>Der Mitarbeiter kann sich sofort mit diesen Zugangsdaten anmelden.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Passwort (min. 8 Zeichen)</Label>
                <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={creating}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Erstellen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {accounts.length >= MAX && (
          <p className="text-xs text-muted-foreground">Maximale Anzahl an Sub-Accounts erreicht.</p>
        )}
      </CardContent>
    </Card>
  );
}