import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, ShoppingBag, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  api_url: string;
  active: boolean;
}

const OnlineShopPage = () => {
  const { orders, updateStatus, deleteOrder, updateOrder } = useOrders();
  const [connection, setConnection] = useState<ShopConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("shop_connections")
        .select("id, platform, api_url, active")
        .eq("active", true)
        .maybeSingle();
      setConnection(data as ShopConnection | null);
      setLoading(false);
    })();
  }, []);

  // Heuristik: Bestellungen aus dem Shop sind die, deren Notizen einen Shop-Marker enthalten.
  const shopOrders = useMemo(
    () =>
      orders.filter((o) => {
        const n = (o.notizen ?? "").toLowerCase();
        return n.includes("[shop]") || n.includes("shop-import") || n.includes("shopify") || n.includes("woocommerce");
      }),
    [orders]
  );

  const currentOrder = selectedOrder ? orders.find((o) => o.id === selectedOrder.id) ?? null : null;

  return (
    <DashboardLayout title="Online-Shop">
      <div className="space-y-6 max-w-5xl">
        {/* Connection Status */}
        {loading ? (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">Verbindung wird geprüft…</CardContent></Card>
        ) : connection ? (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Verbindung aktiv</p>
                <p className="text-sm text-muted-foreground">
                  {PLATFORM_LABELS[connection.platform] ?? connection.platform} · {connection.api_url}
                </p>
              </div>
              <Badge variant="secondary">Aktiv</Badge>
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
                  Aktuell ist kein Online-Shop angebunden. Bitte wenden Sie sich an den Support, um eine Verbindung einzurichten.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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
