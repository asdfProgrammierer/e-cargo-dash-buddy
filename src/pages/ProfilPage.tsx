import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

const ProfilPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firmaName, setFirmaName] = useState("");
  const [ansprechpartner, setAnsprechpartner] = useState("");
  const [telefon, setTelefon] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("firma_name, ansprechpartner, telefon")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setFirmaName(data.firma_name ?? "");
        setAnsprechpartner(data.ansprechpartner ?? "");
        setTelefon(data.telefon ?? "");
      }
      if (error && error.code !== "PGRST116") {
        toast.error("Profil konnte nicht geladen werden");
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ firma_name: firmaName, ansprechpartner, telefon })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      toast.success("Profil gespeichert");
    }
    setSaving(false);
  };

  return (
    <DashboardLayout title="Mein Profil">
      <div className="max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Profildaten</CardTitle>
            <CardDescription>Bearbeite deine Firmen- und Kontaktdaten</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label>E-Mail</Label>
                  <Input value={user?.email ?? ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Firmenname</Label>
                  <Input value={firmaName} onChange={(e) => setFirmaName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ansprechpartner</Label>
                  <Input value={ansprechpartner} onChange={(e) => setAnsprechpartner(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Speichern
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ProfilPage;
