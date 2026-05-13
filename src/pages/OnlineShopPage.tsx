import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, ShoppingBag, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useOrders } from "@/context/OrderContext";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { Order } from "@/types/order";

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  shopware: "Shopware",
  magento: "Magento",
  custom: "Eigener Shop",
};

interface ShopConnection {
  id: string;
  platform: string;
  shop_domain: string | null;
  api_url: string;
  active: boolean;
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
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadConnection = useCallback(async () => {
    if (!merchantId) return;
    const { data } = await supabase
      .from("shop_connections")
      .select("id, platform, shop_domain, api_url, active, last_sync_at, last_sync_status, last_sync_error")
      .eq("user_id", merchantId)
      .eq("active", true)
      .maybeSingle();
    setConnection((data as ShopConnection | null) ?? null);
    setLoading(false);
  }, [merchantId]);

  useEffect(() => { void loadConnection(); }, [loadConnection]);

  const triggerSync = useCallback(async () => {
    if (!connection) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-sync", {
        body: { connectionId: connection.id },
      });
      if (error) throw error;
      const result = (data as { results?: Array<{ imported?: number; skippedPlz?: number; skippedDup?: number; error?: string }> })?.results?.[0];
      if (result?.error) {
        toast.error("Sync fehlgeschlagen", { description: result.error });
      } else {
        toast.success("Sync abgeschlossen", {
          description: `Importiert: ${result?.imported ?? 0} · Außerhalb PLZ: ${result?.skippedPlz ?? 0} · Bereits vorhanden: ${result?.skippedDup ?? 0}`,
        });
      }
      await loadConnection();
    } catch (err) {
      toast.error("Sync fehlgeschlagen", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSyncing(false);
    }
  }, [connection, loadConnection]);

  const shopOrders = useMemo(
    () => orders.filter((o) => (o.notizen ?? "").toLowerCase().includes("[shopify")
      || (o.notizen ?? "").toLowerCase().includes("[shop]")
      || (o.notizen ?? "").toLowerCase().includes("shop-import")
      || (o.notizen ?? "").toLowerCase().includes("woocommerce")),
    [orders],
  );

  const currentOrder = selectedOrder ? orders.find((o) => o.id === selectedOrder.id) ?? null : null;

  return (
    <DashboardLayout title="Online-Shop">
      <div className="space-y-6 max-w-5xl">
        {loading ? (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">Verbindung wird geprüft…</CardContent></Card>
        ) : connection ? (
          <Card className={connection.last_sync_status === "error" ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"}>
            <CardContent className="flex items-center gap-3 py-5">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${connection.last_sync_status === "error" ? "bg-destructive/15" : "bg-success/15"}`}>
                {connection.last_sync_status === "error"
                  ? <AlertCircle className="h-5 w-5 text-destructive" />
                  : <CheckCircle2 className="h-5 w-5 text-success" />}
              </div>
              <div className="flex-1">
                <p className="font-medium">
                  {PLATFORM_LABELS[connection.platform] ?? connection.platform}-Verbindung aktiv
                </p>
                <p className="text-sm text-muted-foreground">
                  {connection.shop_domain || connection.api_url}
                  {" · "}
                  {connection.last_sync_at
                    ? `Letzter Sync: ${new Date(connection.last_sync_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`
                    : "Noch nie synchronisiert"}
                  {connection.last_sync_status === "error" && connection.last_sync_error
                    ? ` · ${connection.last_sync_error}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Auto-Sync alle 15 Min</Badge>
                <Button size="sm" variant="outline" onClick={triggerSync} disabled={syncing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Synchronisiere…" : "Jetzt synchronisieren"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15">
                <AlertCircle className="h-5 w-5 text-warning" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Keine Shop-Verbindung aktiv</p>
                <p className="text-sm text-muted-foreground">
                  Aktuell ist kein Online-Shop angebunden. Bitte wenden Sie sich an unser Team, um die Anbindung einzurichten.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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
