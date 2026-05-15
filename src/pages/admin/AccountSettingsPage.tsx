import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

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
      </div>
    </AdminLayout>
  );
}