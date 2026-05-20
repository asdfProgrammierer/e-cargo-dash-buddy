import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, ShieldPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  const [admins, setAdmins] = useState<Array<{ user_id: string; email: string | null; created_at: string }>>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminPw, setNewAdminPw] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadAdmins = async () => {
    setLoadingAdmins(true);
    const { data, error } = await supabase.functions.invoke("admin-create-admin", {
      body: { action: "list" },
    });
    setLoadingAdmins(false);
    if (error) {
      toast.error("Admins konnten nicht geladen werden");
      return;
    }
    setAdmins(data?.admins ?? []);
  };

  useEffect(() => { loadAdmins(); }, []);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPw.length < 8) {
      toast.error("Passwort muss mindestens 8 Zeichen haben");
      return;
    }
    setCreatingAdmin(true);
    const { data, error } = await supabase.functions.invoke("admin-create-admin", {
      body: { action: "create", email: newAdminEmail, password: newAdminPw, name: newAdminName },
    });
    setCreatingAdmin(false);
    if (error || data?.error) {
      toast.error(data?.error ?? "Admin konnte nicht erstellt werden");
      return;
    }
    toast.success("Admin-Account erstellt");
    setNewAdminEmail(""); setNewAdminName(""); setNewAdminPw("");
    loadAdmins();
  };

  const handleDeleteAdmin = async () => {
    if (!deleteTarget) return;
    const { data, error } = await supabase.functions.invoke("admin-create-admin", {
      body: { action: "delete", user_id: deleteTarget },
    });
    setDeleteTarget(null);
    if (error || data?.error) {
      toast.error(data?.error ?? "Löschen fehlgeschlagen");
      return;
    }
    toast.success("Admin gelöscht");
    loadAdmins();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (newPw.length < 8) {
      toast.error("Neues Passwort muss mindestens 8 Zeichen haben");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("Die Passwörter stimmen nicht überein");
      return;
    }
    setSaving(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPw,
    });
    if (signInError) {
      setSaving(false);
      toast.error("Aktuelles Passwort ist falsch");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) {
      toast.error("Passwort konnte nicht geändert werden", { description: error.message });
      return;
    }
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    toast.success("Passwort erfolgreich geändert");
  };

  return (
    <AdminLayout title="Einstellungen">
      <div className="space-y-6">
        <SettingsTabs />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Passwort ändern
            </CardTitle>
            <CardDescription>
              Ändere das Passwort für deinen Admin-Account ({user?.email}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Aktuelles Passwort</Label>
                <Input id="current" type="password" autoComplete="current-password"
                  value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">Neues Passwort</Label>
                <Input id="new" type="password" autoComplete="new-password" minLength={8}
                  value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
                <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Neues Passwort bestätigen</Label>
                <Input id="confirm" type="password" autoComplete="new-password" minLength={8}
                  value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Passwort ändern
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldPlus className="h-5 w-5 text-primary" />
              Admin-Accounts verwalten
            </CardTitle>
            <CardDescription>
              Lege weitere Admin-Accounts an oder entferne bestehende.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleCreateAdmin} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Name</Label>
                <Input value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} placeholder="Vor- und Nachname" />
              </div>
              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Passwort</Label>
                <Input type="password" minLength={8} value={newAdminPw} onChange={(e) => setNewAdminPw(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={creatingAdmin}>
                  {creatingAdmin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldPlus className="mr-2 h-4 w-4" />}
                  Admin anlegen
                </Button>
              </div>
            </form>

            <div>
              <h3 className="mb-3 text-sm font-medium">Bestehende Admins</h3>
              {loadingAdmins ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lade...
                </div>
              ) : admins.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Admins gefunden.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {admins.map((a) => (
                    <li key={a.user_id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.email ?? a.user_id}</p>
                        <p className="text-xs text-muted-foreground">seit {new Date(a.created_at).toLocaleDateString("de-DE")}</p>
                      </div>
                      {a.user_id !== user?.id && (
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(a.user_id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Admin löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Der Account wird unwiderruflich gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAdmin}>Löschen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}