import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, AlertCircle, ShoppingBag, Package, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useOrders } from "@/context/OrderContext";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { Order } from "@/types/order";
import { toast } from "sonner";

interface ShopConnection {
  id: string;
  platform: string;
  api_url: string;
  shop_domain: string | null;
  api_key: string;
  active: boolean;
  auto_fulfill: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

const OnlineShopPage = () => {
  const { ownerUserId, user } = useAuth();
  const merchantId = ownerUserId ?? user?.id ?? null;
  const { orders, updateStatus, deleteOrder, updateOrder } = useOrders();
  const [connection, setConnection] = useState<ShopConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [autoFulfill, setAutoFulfill] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadConnection = useCallback(async () => {
    if (!merchantId) return;
    const { data } = await supabase
      .from("shop_connections")
      .select("id, platform, api_url, shop_domain, api_key, active, auto_fulfill, last_sync_at, last_sync_status, last_sync_error")
      .eq("user_id", merchantId)
      .eq("platform", "shopify")
      .maybeSingle();
    const conn = (data as ShopConnection | null) ?? null;
    setConnection(conn);
    if (conn) {
      setDomain(conn.shop_domain || conn.api_url || "");
      setToken("");
      setAutoFulfill(conn.auto_fulfill);
    }
    setLoading(false);
  }, [merchantId]);

  useEffect(() => { void loadConnection(); }, [loadConnection]);

  const shopOrders = useMemo(
    () => orders.filter((o) => (o as Order & { shopConnectionId?: string }).shopConnectionId
      || (o.notizen ?? "").toLowerCase().includes("[shopify")),
    [orders],
  );

  const handleSave = async () => {
    if (!merchantId) return;
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!cleanDomain) { toast.error("Shop-Domain fehlt"); return; }
    if (!connection && !token.trim()) { toast.error("Access Token erforderlich"); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      user_id: merchantId,
      platform: "shopify",
      shop_domain: cleanDomain.includes(".") ? cleanDomain : `${cleanDomain}.myshopify.com`,
      api_url: cleanDomain.includes(".") ? cleanDomain : `${cleanDomain}.myshopify.com`,
      auto_fulfill: autoFulfill,
      active: true,
    };
    if (token.trim()) payload.api_key = token.trim();

    const { error } = connection
      ? await supabase.from("shop_connections").update(payload).eq("id", connection.id)
      : await supabase.from("shop_connections").insert({ ...payload, api_key: token.trim() });
    setSaving(false);
    if (error) { toast.error("Speichern fehlgeschlagen: " + error.message); return; }
    toast.success("Shopify-Verbindung gespeichert");
    await loadConnection();
  };

  const handleSync = async () => {
    if (!connection) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("shopify-sync", {
      body: { connectionId: connection.id },
    });
    setSyncing(false);
    if (error) { toast.error("Sync fehlgeschlagen: " + error.message); return; }
    const r = (data as { results?: Array<{ imported?: number; skippedPlz?: number; error?: string }> })?.results?.[0];
    if (r?.error) toast.error("Sync-Fehler: " + r.error);
    else toast.success(`${r?.imported ?? 0} neue Bestellung(en) importiert${r?.skippedPlz ? `, ${r.skippedPlz} außerhalb PLZ-Gebiet` : ""}`);
    await loadConnection();
  };

  const handleDelete = async () => {
    if (!connection) return;
    if (!confirm("Shopify-Verbindung wirklich löschen?")) return;
    const { error } = await supabase.from("shop_connections").delete().eq("id", connection.id);
    if (error) { toast.error("Löschen fehlgeschlagen"); return; }
    setConnection(null);
    setDomain(""); setToken(""); setAutoFulfill(true);
    toast.success("Verbindung gelöscht");
  };

  const currentOrder = selectedOrder ? orders.find((o) => o.id === selectedOrder.id) ?? null : null;

  return (
    <DashboardLayout title="Online-Shop">
      <div className="space-y-6 max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Shopify-Verbindung
            </CardTitle>
            <CardDescription>
              Verbinden Sie Ihren Shopify-Store, damit bezahlte Bestellungen mit Lieferadresse in unserem PLZ-Gebiet
              automatisch alle 15 Minuten als Aufträge übernommen und Tracking-Infos zurückgemeldet werden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Wird geladen…</p>
            ) : (
              <>
                {connection && (
                  <div className={`flex items-center gap-3 rounded-md border p-3 ${
                    connection.last_sync_status === "error"
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-success/30 bg-success/5"
                  }`}>
                    {connection.last_sync_status === "error"
                      ? <AlertCircle className="h-5 w-5 text-destructive" />
                      : <CheckCircle2 className="h-5 w-5 text-success" />}
                    <div className="flex-1 text-sm">
                      <p className="font-medium">
                        {connection.last_sync_status === "error" ? "Letzter Sync fehlgeschlagen" : "Verbindung aktiv"}
                      </p>
                      <p className="text-muted-foreground">
                        {connection.last_sync_at
                          ? `Letzter Sync: ${new Date(connection.last_sync_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`
                          : "Noch nie synchronisiert"}
                        {connection.last_sync_error ? ` · ${connection.last_sync_error}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">Auto-Sync alle 15 Min</Badge>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="shop-domain">Shop-Domain</Label>
                  <Input
                    id="shop-domain"
                    placeholder="mein-shop.myshopify.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Die <code>.myshopify.com</code>-Adresse Ihres Stores (nicht die Custom-Domain).
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="shop-token">Admin API Access Token</Label>
                  <Input
                    id="shop-token"
                    type="password"
                    placeholder={connection ? "•••••••••• (gespeichert – nur ausfüllen zum Ändern)" : "shpat_..."}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Erstellen Sie eine Custom App in Shopify (Settings → Apps → Develop apps) mit den Scopes
                    <code className="mx-1">read_orders</code>, <code className="mx-1">write_orders</code>,
                    <code className="mx-1">read_fulfillments</code>, <code className="mx-1">write_fulfillments</code>,
                    <code className="mx-1">read_assigned_fulfillment_orders</code>, <code className="mx-1">write_assigned_fulfillment_orders</code>
                    und kopieren Sie den Admin API Access Token.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Auto-Fulfillment an Shopify</p>
                    <p className="text-xs text-muted-foreground">
                      Sobald ein Auftrag versendet wird, wird die Bestellung in Shopify als versendet markiert (inkl. Tracking).
                    </p>
                  </div>
                  <Switch checked={autoFulfill} onCheckedChange={setAutoFulfill} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {connection ? "Speichern" : "Verbinden"}
                  </Button>
                  {connection && (
                    <>
                      <Button variant="outline" onClick={handleSync} disabled={syncing}>
                        {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Jetzt synchronisieren
                      </Button>
                      <Button variant="ghost" className="text-destructive" onClick={handleDelete}>
                        <Trash2 className="mr-2 h-4 w-4" /> Löschen
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Imported Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Aus dem Shop übertragene Bestellungen
            </CardTitle>
            <CardDescription>
              Übersicht aller Bestellungen, die automatisch aus Ihrem Online-Shop importiert wurden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {shopOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Package className="h-8 w-8 text-muted-foreground/60" />
                <p>Noch keine Bestellungen aus dem Shop übertragen.</p>
              </div>
            ) : (
              <OrderTable
                orders={shopOrders}
                onDelete={deleteOrder}
                onSelect={(o) => { setSelectedOrder(o); setSheetOpen(true); }}
                onCancel={(id) => updateStatus(id, "storniert")}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <OrderDetailSheet
        order={currentOrder}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdateStatus={updateStatus}
        onUpdateOrder={updateOrder}
        canUpdateStatus={false}
      />
    </DashboardLayout>
  );
};

export default OnlineShopPage;
