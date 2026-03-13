import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingBag, Webhook, Key, Link2, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { toast } from "sonner";

const SHOP_PLATFORMS = [
  { value: "shopify", label: "Shopify" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "shopware", label: "Shopware" },
  { value: "magento", label: "Magento" },
  { value: "custom", label: "Eigener Shop" },
];

const OnlineShopPage = () => {
  const [platform, setPlatform] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [testing, setTesting] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co"}/functions/v1/shop-webhook`;

  const handleConnect = async () => {
    if (!platform || !apiUrl || !apiKey) {
      toast.error("Bitte alle Felder ausfüllen");
      return;
    }
    setTesting(true);
    // Simulate connection test
    await new Promise((r) => setTimeout(r, 1500));
    setTesting(false);
    setConnected(true);
    toast.success("Verbindung erfolgreich hergestellt!");
  };

  const handleDisconnect = () => {
    setConnected(false);
    setPlatform("");
    setApiUrl("");
    setApiKey("");
    toast.info("Shop-Verbindung getrennt");
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook-URL kopiert");
  };

  return (
    <DashboardLayout title="Online-Shop verbinden">
      <div className="space-y-6 max-w-3xl">
        {connected && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="flex items-center gap-3 py-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div className="flex-1">
                <p className="font-medium text-sm">Shop verbunden</p>
                <p className="text-xs text-muted-foreground">
                  {SHOP_PLATFORMS.find((p) => p.value === platform)?.label} · {apiUrl}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDisconnect}>
                Trennen
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="api">
          <TabsList>
            <TabsTrigger value="api" className="gap-1.5">
              <Key className="h-4 w-4" />
              API-Verbindung
            </TabsTrigger>
            <TabsTrigger value="webhook" className="gap-1.5">
              <Webhook className="h-4 w-4" />
              Webhook
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Link2 className="h-5 w-5 text-primary" />
                  API-Verbindung einrichten
                </CardTitle>
                <CardDescription>
                  Verbinden Sie Ihren Online-Shop über die REST-API, um Bestellungen automatisch zu importieren.
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
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>API-URL / Shop-URL</Label>
                  <Input
                    className="mt-1.5"
                    placeholder="https://mein-shop.de/api"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                  />
                </div>
                <div>
                  <Label>API-Schlüssel</Label>
                  <Input
                    className="mt-1.5"
                    type="password"
                    placeholder="sk_live_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>Die API-Zugangsdaten finden Sie in den Einstellungen Ihres Online-Shops.</p>
                </div>
                <Button onClick={handleConnect} disabled={testing || connected} className="w-full">
                  {testing ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Verbindung wird getestet…
                    </>
                  ) : connected ? (
                    "Verbunden"
                  ) : (
                    "Verbindung herstellen"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhook" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Webhook className="h-5 w-5 text-primary" />
                  Webhook einrichten
                </CardTitle>
                <CardDescription>
                  Richten Sie einen Webhook in Ihrem Online-Shop ein, um Bestellungen in Echtzeit zu empfangen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Ihre Webhook-URL</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border p-4">
                  <h4 className="font-medium text-sm">So richten Sie den Webhook ein:</h4>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                    <li>Öffnen Sie die Webhook-Einstellungen in Ihrem Online-Shop</li>
                    <li>Erstellen Sie einen neuen Webhook für Bestellereignisse</li>
                    <li>Fügen Sie die oben angezeigte URL als Zieladresse ein</li>
                    <li>Wählen Sie die Ereignisse: <Badge variant="secondary" className="text-xs mx-1">order.created</Badge> <Badge variant="secondary" className="text-xs mx-1">order.updated</Badge></li>
                    <li>Speichern und testen Sie den Webhook</li>
                  </ol>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <ShoppingBag className="h-4 w-4 shrink-0" />
                  <p>Unterstützte Formate: JSON. Der Webhook akzeptiert POST-Anfragen mit Bestelldaten.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default OnlineShopPage;
