import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PickupSettingsCell } from "@/components/admin/PickupSettingsCell";
import { DhlPricingTable } from "@/components/admin/DhlPricingTable";
import { AdminCreateOrderDialog } from "@/components/admin/AdminCreateOrderDialog";
import {
  ArrowLeft, Building2, User, MapPin, Phone, Mail, Globe, FileText,
  Key, Link2, ShoppingBag, CheckCircle2, AlertCircle, Plug,
  Calendar, Shield, Truck, Package
} from "lucide-react";

interface MerchantProfile {
  id: string;
  user_id: string;
  firma_name: string | null;
  ansprechpartner: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  stadt: string | null;
  land: string | null;
  ustid: string | null;
  website: string | null;
  logo_url: string | null;
  paketpreis: number | null;
  merchant_code: string | null;
  approved: boolean;
  pickup_enabled: boolean;
  pickup_weekdays: number[];
  dhl_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ShopConnection {
  id: string;
  user_id: string;
  platform: string;
  api_url: string;
  api_key: string;
  active: boolean;
  notizen: string | null;
  created_at: string;
  updated_at: string;
}

const SHOP_PLATFORMS = [
  { value: "shopify", label: "Shopify" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "shopware", label: "Shopware" },
  { value: "magento", label: "Magento" },
  { value: "custom", label: "Eigener Shop" },
];

const HaendlerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [shopConn, setShopConn] = useState<ShopConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderCount, setOrderCount] = useState(0);

  // Shop form state
  const [platform, setPlatform] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [shopActive, setShopActive] = useState(false);
  const [shopNotizen, setShopNotizen] = useState("");
  const [savingShop, setSavingShop] = useState(false);
  const [packagePrice, setPackagePrice] = useState("");
  const [merchantCode, setMerchantCode] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingMerchantCode, setSavingMerchantCode] = useState(false);
  const [testingShop, setTestingShop] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [profileRes, shopRes, ordersRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).single(),
        supabase.from("shop_connections").select("*").eq("user_id", id),
        supabase.from("orders").select("id", { count: "exact", head: true }),
      ]);

      if (profileRes.data) {
        const p: any = profileRes.data;
        setProfile({
          ...p,
          pickup_enabled: p.pickup_enabled ?? false,
          pickup_weekdays: Array.isArray(p.pickup_weekdays) ? p.pickup_weekdays : [],
          dhl_enabled: p.dhl_enabled ?? false,
        } as MerchantProfile);

        // Now fetch shop connections and orders using user_id
        const userId = profileRes.data.user_id;
        const [shopRes2, ordersRes2] = await Promise.all([
          (supabase as any).rpc("admin_get_shop_connection", { _user_id: userId }),
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", userId),
        ]);

        if (shopRes2.data) {
          const s = shopRes2.data as ShopConnection;
          setShopConn(s);
          setPlatform(s.platform);
          setApiUrl(s.api_url);
          setApiKey(s.api_key);
          setShopActive(s.active);
          setShopNotizen(s.notizen || "");
        }
        setPackagePrice(profileRes.data.paketpreis != null ? String(profileRes.data.paketpreis) : "");
        setMerchantCode(profileRes.data.merchant_code ?? "");
        setOrderCount(ordersRes2.count ?? 0);
      } else {
        toast.error("Händler nicht gefunden");
        navigate("/admin/haendler");
      }
      setLoading(false);
    };
    load();
  }, [id, navigate]);

  const toggleApproval = async () => {
    if (!profile) return;
    const newVal = !profile.approved;
    const { error } = await supabase.from("profiles").update({ approved: newVal }).eq("id", profile.id);
    if (error) {
      toast.error("Fehler beim Aktualisieren");
    } else {
      setProfile({ ...profile, approved: newVal });
      toast.success(newVal ? "Händler freigeschaltet" : "Händler gesperrt");
    }
  };

  const toggleDhl = async (next: boolean) => {
    if (!profile) return;
    const { error } = await (supabase as any).from("profiles").update({ dhl_enabled: next }).eq("id", profile.id);
    if (error) {
      toast.error("DHL-Einstellung konnte nicht gespeichert werden");
    } else {
      setProfile({ ...profile, dhl_enabled: next });
      toast.success(next ? "DHL-Versand aktiviert" : "DHL-Versand deaktiviert");
    }
  };

  const savePackagePrice = async () => {
    if (!profile) return;

    const trimmed = packagePrice.trim();
    const numericValue = trimmed === "" ? null : Number(trimmed.replace(",", "."));

    if (trimmed !== "" && (!Number.isFinite(numericValue) || numericValue < 0)) {
      toast.error("Bitte einen gültigen Paketpreis eingeben");
      return;
    }

    setSavingPrice(true);
    const { error } = await supabase
      .from("profiles")
      .update({ paketpreis: numericValue })
      .eq("id", profile.id);
    setSavingPrice(false);

    if (error) {
      toast.error("Paketpreis konnte nicht gespeichert werden");
      return;
    }

    setProfile({ ...profile, paketpreis: numericValue });
    setPackagePrice(numericValue != null ? String(numericValue) : "");
    toast.success("Paketpreis gespeichert");
  };

  const saveMerchantCode = async () => {
    if (!profile) return;

    const normalizedCode = merchantCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(normalizedCode)) {
      toast.error("Bitte genau 3 Zeichen für den Händlercode eingeben");
      return;
    }

    setSavingMerchantCode(true);
    const { data, error } = await (supabase as any).rpc("admin_set_merchant_code", {
      _profile_id: profile.id,
      _merchant_code: normalizedCode,
    });
    setSavingMerchantCode(false);

    if (error) {
      toast.error(error.message?.includes("duplicate") ? "Dieser Händlercode ist bereits vergeben" : "Händlercode konnte nicht gespeichert werden");
      return;
    }

    const savedCode = typeof data === "string" ? data : normalizedCode;
    setMerchantCode(savedCode);
    setProfile({ ...profile, merchant_code: savedCode });
    toast.success("Händlercode gespeichert und Aufträge neu nummeriert");
  };

  const saveShopConnection = async () => {
    if (!profile) return;
    if (!platform) {
      toast.error("Bitte Plattform auswählen");
      return;
    }
    setSavingShop(true);
    const payload = {
      user_id: profile.user_id,
      platform,
      api_url: apiUrl,
      api_key: apiKey,
      active: shopActive,
      notizen: shopNotizen || null,
    };

    let error;
    if (shopConn) {
      ({ error } = await supabase.from("shop_connections").update(payload).eq("id", shopConn.id));
    } else {
      const res = await supabase.from("shop_connections").insert(payload).select().single();
      error = res.error;
      if (res.data) setShopConn(res.data as ShopConnection);
    }
    setSavingShop(false);
    if (error) {
      toast.error("Fehler beim Speichern der Shop-Verbindung");
    } else {
      toast.success("Shop-Verbindung gespeichert");
    }
  };

  const deleteShopConnection = async () => {
    if (!shopConn) return;
    const { error } = await supabase.from("shop_connections").delete().eq("id", shopConn.id);
    if (error) {
      toast.error("Fehler beim Löschen");
    } else {
      setShopConn(null);
      setPlatform("");
      setApiUrl("");
      setApiKey("");
      setShopActive(false);
      setShopNotizen("");
      toast.success("Shop-Verbindung gelöscht");
    }
  };

  const testShopConnection = async () => {
    if (!shopConn) {
      toast.error("Bitte zuerst die Verbindung speichern");
      return;
    }
    setTestingShop(true);
    const { data, error } = await supabase.functions.invoke("shopify-test-connection", {
      body: { connectionId: shopConn.id },
    });
    setTestingShop(false);
    if (error) {
      toast.error(`Test fehlgeschlagen: ${error.message}`);
      return;
    }
    if (data?.ok) {
      toast.success(`Verbindung erfolgreich: ${data.shop?.name ?? data.shop?.domain ?? "OK"}`);
    } else {
      toast.error(`Verbindung fehlgeschlagen: ${data?.error ?? "Unbekannter Fehler"}`);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Händler laden...">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  if (!profile) return null;

  return (
    <AdminLayout title={profile.firma_name || profile.ansprechpartner || "Händler"}>
      <div className="space-y-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/haendler")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Übersicht
        </Button>

        {/* Header card */}
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold truncate">{profile.firma_name || "–"}</h2>
                <Badge variant={profile.approved ? "default" : "secondary"}>
                  {profile.approved ? "Aktiv" : "Ausstehend"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {profile.ansprechpartner} · Registriert am {new Date(profile.created_at).toLocaleDateString("de-DE")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AdminCreateOrderDialog
                merchantUserId={profile.user_id}
                merchantLabel={profile.firma_name || profile.ansprechpartner || undefined}
                defaultSenderName={profile.firma_name || profile.ansprechpartner || ""}
                defaultSenderAddress={[profile.strasse, profile.plz, profile.stadt].filter(Boolean).join(", ")}
                onCreated={() => setOrderCount((c) => c + 1)}
              />
              <span className="text-sm text-muted-foreground">Freigabe</span>
              <Switch checked={profile.approved} onCheckedChange={toggleApproval} />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5">
              <User className="h-4 w-4" />
              Übersicht
            </TabsTrigger>
            <TabsTrigger value="shop" className="gap-1.5">
              <ShoppingBag className="h-4 w-4" />
              Shop-Anbindung
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Shield className="h-4 w-4" />
              Einstellungen
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Kontaktdaten</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{profile.ansprechpartner || "–"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{profile.telefon || "–"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span>{profile.website || "–"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>USt-IdNr.: {profile.ustid || "–"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Paketpreis: {profile.paketpreis != null ? `${profile.paketpreis.toFixed(2)} €` : "Nicht hinterlegt"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span>Händlercode: {profile.merchant_code || "Nicht hinterlegt"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Adresse</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p>{profile.strasse || "–"}</p>
                      <p>{[profile.plz, profile.stadt].filter(Boolean).join(" ") || "–"}</p>
                      <p>{profile.land || "–"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <ShoppingBag className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{orderCount}</p>
                    <p className="text-xs text-muted-foreground">Aufträge gesamt</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Link2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{shopConn?.active ? "Aktiv" : "–"}</p>
                    <p className="text-xs text-muted-foreground">Shop-Anbindung</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {new Date(profile.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                    <p className="text-xs text-muted-foreground">Registriert seit</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Shop Connection Tab */}
          <TabsContent value="shop" className="mt-6 space-y-6 max-w-2xl">
            {shopConn?.active && (
              <Card className="border-success/30 bg-success/5">
                <CardContent className="flex items-center gap-3 py-4">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Shop verbunden</p>
                    <p className="text-xs text-muted-foreground">
                      {SHOP_PLATFORMS.find((p) => p.value === shopConn.platform)?.label || shopConn.platform} · {shopConn.api_url}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Key className="h-5 w-5 text-primary" />
                  API-Verbindung
                </CardTitle>
                <CardDescription>
                  Shop-Anbindung für diesen Händler konfigurieren.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Shop-Plattform</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Plattform wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHOP_PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>API-URL / Shop-URL</Label>
                  <Input className="mt-1.5" placeholder="https://shop.example.com/api" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
                </div>
                <div>
                  <Label>API-Schlüssel</Label>
                  <Input className="mt-1.5" type="password" placeholder="sk_live_..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                </div>
                <div>
                  <Label>Notizen</Label>
                  <Textarea className="mt-1.5" placeholder="Interne Notizen zur Anbindung..." value={shopNotizen} onChange={(e) => setShopNotizen(e.target.value)} rows={3} />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Verbindung aktiv</p>
                    <p className="text-xs text-muted-foreground">Automatischer Auftragsimport aktivieren</p>
                  </div>
                  <Switch checked={shopActive} onCheckedChange={setShopActive} />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={saveShopConnection} disabled={savingShop} className="flex-1">
                    {savingShop ? "Speichern..." : shopConn ? "Verbindung aktualisieren" : "Verbindung speichern"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={testShopConnection}
                    disabled={testingShop || !shopConn}
                    title={!shopConn ? "Erst speichern, dann testen" : "Verbindung testen"}
                  >
                    <Plug className="h-4 w-4 mr-2" />
                    {testingShop ? "Teste..." : "Verbindung testen"}
                  </Button>
                  {shopConn && (
                    <Button variant="outline" className="text-destructive" onClick={deleteShopConnection}>
                      Löschen
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-6 space-y-4 max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Zugangssteuerung</CardTitle>
                <CardDescription>Freigabe und Berechtigungen für diesen Händler verwalten.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div>
                    <p className="font-medium text-sm">Paketpreis pro Händler</p>
                    <p className="text-xs text-muted-foreground">Grundlage für die spätere Rechnungsberechnung aller zugestellten Pakete.</p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={packagePrice}
                      onChange={(e) => setPackagePrice(e.target.value)}
                      placeholder="z. B. 4,90"
                    />
                    <Button onClick={savePackagePrice} disabled={savingPrice}>
                      {savingPrice ? "Speichern..." : "Preis speichern"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div>
                    <p className="font-medium text-sm">Händlercode für Auftragsnummern</p>
                    <p className="text-xs text-muted-foreground">Neue und bestehende Aufträge erhalten das Format EC-CODE-0000001.</p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={merchantCode}
                      onChange={(e) => setMerchantCode(e.target.value.toUpperCase().slice(0, 3))}
                      placeholder="PMF"
                      className="uppercase"
                    />
                    <Button onClick={saveMerchantCode} disabled={savingMerchantCode}>
                      {savingMerchantCode ? "Speichern..." : "Code speichern"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Tägliche Abholung</p>
                      <p className="text-xs text-muted-foreground">
                        Aktiviert die automatische Erstellung täglicher Abhol-Aufträge an den ausgewählten Wochentagen.
                      </p>
                    </div>
                  </div>
                  <PickupSettingsCell
                    profileId={profile.id}
                    pickupEnabled={profile.pickup_enabled}
                    pickupWeekdays={profile.pickup_weekdays}
                    onChange={(next) =>
                      setProfile((prev) => prev ? {
                        ...prev,
                        pickup_enabled: next.pickup_enabled,
                        pickup_weekdays: next.pickup_weekdays,
                      } : prev)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-sm">Account-Freigabe</p>
                    <p className="text-xs text-muted-foreground">
                      {profile.approved
                        ? "Händler kann sich einloggen und Aufträge erstellen"
                        : "Händler ist gesperrt und hat keinen Zugang"}
                    </p>
                  </div>
                  <Switch checked={profile.approved} onCheckedChange={toggleApproval} />
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">DHL-Versand außerhalb des Liefergebiets</p>
                        <p className="text-xs text-muted-foreground">
                          Wenn aktiviert, wird automatisch ein DHL-Label über unser Geschäftskunden-Konto erstellt,
                          sobald die Empfänger-PLZ außerhalb des e-cargo Liefergebiets liegt. Der Händlercode dient als Kostenstelle für die DHL-Abrechnung.
                        </p>
                      </div>
                    </div>
                    <Switch checked={profile.dhl_enabled} onCheckedChange={toggleDhl} />
                  </div>
                  {profile.dhl_enabled && !profile.merchant_code && (
                    <p className="text-xs text-warning flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Bitte zuerst einen Händlercode hinterlegen (wird als Kostenstelle übermittelt).
                    </p>
                  )}
                  {profile.dhl_enabled && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-sm font-medium mb-2">Individuelle DHL-Preise (netto, €)</p>
                      <DhlPricingTable merchantUserId={profile.user_id} />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>Änderungen an der Freigabe wirken sich sofort auf den Zugang des Händlers aus.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default HaendlerDetailPage;
