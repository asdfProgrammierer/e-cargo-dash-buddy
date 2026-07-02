import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHead } from "@/components/PageHead";
import { SubAccountsCard } from "@/components/profile/SubAccountsCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, Upload, Building2, User, MapPin, Globe, Clock3 } from "lucide-react";
import { toast } from "sonner";
import {
  EMPTY_OPENING_HOURS,
  OpeningHoursEditor,
  type OpeningHoursState,
  normalizeOpeningHours,
  serializeOpeningHours,
} from "@/components/profile/OpeningHoursEditor";

const ProfilPage = () => {
  const { user, isSubAccount } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [firmaName, setFirmaName] = useState("");
  const [ansprechpartner, setAnsprechpartner] = useState("");
  const [telefon, setTelefon] = useState("");
  const [strasse, setStrasse] = useState("");
  const [plz, setPlz] = useState("");
  const [stadt, setStadt] = useState("");
  const [land, setLand] = useState("Deutschland");
  const [ustid, setUstid] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [openingHours, setOpeningHours] = useState<OpeningHoursState>(EMPTY_OPENING_HOURS);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setFirmaName(data.firma_name ?? "");
        setAnsprechpartner(data.ansprechpartner ?? "");
        setTelefon(data.telefon ?? "");
        setStrasse((data as any).strasse ?? "");
        setPlz((data as any).plz ?? "");
        setStadt((data as any).stadt ?? "");
        setLand((data as any).land ?? "Deutschland");
        setUstid((data as any).ustid ?? "");
        setWebsite((data as any).website ?? "");
        setLogoUrl((data as any).logo_url ?? "");
        setOpeningHours(normalizeOpeningHours((data as any).opening_hours));
      }
      if (error && error.code !== "PGRST116") {
        toast.error("Profil konnte nicht geladen werden");
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Bitte nur Bilddateien hochladen");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Maximale Dateigröße: 2 MB");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Fehler beim Hochladen");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    const newUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    setLogoUrl(newUrl);

    await supabase
      .from("profiles")
      .update({ logo_url: newUrl } as any)
      .eq("user_id", user.id);

    toast.success("Logo hochgeladen");
    setUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const normalizedOpeningHours = serializeOpeningHours(openingHours);

    const { error } = await supabase
      .from("profiles")
      .update({
        firma_name: firmaName,
        ansprechpartner,
        telefon,
        strasse,
        plz,
        stadt,
        land,
        ustid,
        website,
        opening_hours: normalizedOpeningHours,
      } as any)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      setOpeningHours(normalizedOpeningHours);
      toast.success("Profil gespeichert");
    }
    setSaving(false);
  };

  return (
    <DashboardLayout title="Mein Profil">
      <PageHead title="Mein Profil – e-cargo Händler-Dashboard" description="Verwalten Sie Ihre e-cargo Händlerdaten, Firmenlogo, Ansprechpartner, Öffnungszeiten und Sub-Accounts an einer Stelle." path="/profil" />
      <div className="max-w-2xl space-y-6">
        {isSubAccount && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Sub-Account
              </CardTitle>
              <CardDescription>
                Du nutzt einen Sub-Account. Firmen- und Versanddaten werden vom Hauptkonto verwaltet.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        {!isSubAccount && (
          <>
        {/* Logo Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Firmenlogo
            </CardTitle>
            <CardDescription>
              Dein Logo wird auf Versandetiketten und Dokumenten angezeigt
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt={firmaName ? `Firmenlogo von ${firmaName}` : "Firmenlogo des Händlerkontos"} className="h-full w-full object-contain p-2" />
                ) : (
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Logo hochladen
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPG oder SVG – max. 2 MB</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Firmendaten
            </CardTitle>
            <CardDescription>
              Diese Daten werden als Absender in deinen Aufträgen verwendet
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-6">
                {/* Basic info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Firmenname</Label>
                    <Input value={firmaName} onChange={(e) => setFirmaName(e.target.value)} placeholder="eCargo Logistic GmbH" />
                  </div>
                  <div className="space-y-2">
                    <Label>Ansprechpartner</Label>
                    <Input value={ansprechpartner} onChange={(e) => setAnsprechpartner(e.target.value)} placeholder="Max Mustermann" />
                  </div>
                </div>

                <Separator />

                {/* Address */}
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    <MapPin className="h-4 w-4" />
                    Adresse
                  </h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Straße & Hausnummer</Label>
                      <Input value={strasse} onChange={(e) => setStrasse(e.target.value)} placeholder="Hauptstr. 12" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>PLZ</Label>
                        <Input value={plz} onChange={(e) => setPlz(e.target.value)} placeholder="45127" />
                      </div>
                      <div className="space-y-2">
                        <Label>Stadt</Label>
                        <Input value={stadt} onChange={(e) => setStadt(e.target.value)} placeholder="Essen" />
                      </div>
                      <div className="space-y-2">
                        <Label>Land</Label>
                        <Input value={land} onChange={(e) => setLand(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    <Clock3 className="h-4 w-4" />
                    Öffnungszeiten
                  </h3>
                  <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
                </div>

                <Separator />

                {/* Contact & legal */}
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    <Globe className="h-4 w-4" />
                    Kontakt & Rechtliches
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>E-Mail</Label>
                      <Input value={user?.email ?? ""} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefon</Label>
                      <Input type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="+49 201 12345678" />
                    </div>
                    <div className="space-y-2">
                      <Label>USt-IdNr.</Label>
                      <Input value={ustid} onChange={(e) => setUstid(e.target.value)} placeholder="DE123456789" />
                    </div>
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://www.example.de" />
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Profil speichern
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <SubAccountsCard />
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ProfilPage;
