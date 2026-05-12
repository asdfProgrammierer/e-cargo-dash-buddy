import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, UserCheck, UserX, Package } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS, type OrderStatus } from "@/types/order";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { sendOrderStatusEmail } from "@/lib/orderEmail";

type DashboardStats = {
  total: number;
  approved: number;
  pending: number;
  orders: number;
};

type MerchantProfile = {
  user_id: string;
  approved: boolean;
  firma_name: string | null;
  ansprechpartner: string | null;
};

type RecentOrder = {
  id: string;
  user_id: string;
  auftrags_nr: string;
  absender_name: string;
  absender_adresse: string | null;
  empfaenger_name: string;
  empfaenger_adresse: string | null;
  empfaenger_plz: string | null;
  empfaenger_stadt: string;
  empfaenger_email: string | null;
  empfaenger_telefon: string | null;
  pakete: number;
  gewicht: number;
  package_length_cm: number | null;
  package_width_cm: number | null;
  package_height_cm: number | null;
  status: OrderStatus;
  notizen: string | null;
  created_at: string;
};

type OrderHistoryEntry = {
  id: string;
  order_id: string;
  status: OrderStatus;
  reason: string | null;
  created_at: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
});

const AdminDashboardPage = () => {
  const [stats, setStats] = useState<DashboardStats>({ total: 0, approved: 0, pending: 0, orders: 0 });
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | "alle">("neu");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [statusHistory, setStatusHistory] = useState<OrderHistoryEntry[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: profiles, error: profilesError }, { count: orderCount, error: ordersCountError }, { data: allOrders, error: allOrdersError }] = await Promise.all([
        supabase.from("profiles").select("user_id, approved, firma_name, ansprechpartner"),
        supabase.from("orders").select("*", { count: "exact", head: true }),
        supabase
          .from("orders")
          .select("id, user_id, auftrags_nr, absender_name, absender_adresse, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_email, empfaenger_telefon, pakete, gewicht, package_length_cm, package_width_cm, package_height_cm, status, notizen, created_at, dhl_tracking_number, dhl_label_url")
          .order("created_at", { ascending: false }),
      ]);

      if (profilesError || ordersCountError || allOrdersError) {
        console.error("Admin dashboard data could not be loaded", { profilesError, ordersCountError, allOrdersError });
      }

      const total = profiles?.length ?? 0;
      const approved = profiles?.filter((p) => p.approved).length ?? 0;

      setStats({ total, approved, pending: total - approved, orders: orderCount ?? 0 });
      setOrders((allOrders as RecentOrder[] | null) ?? []);
      setLoading(false);
    };

    load();
  }, []);

  const merchantNames = useMemo(() => {
    return new Map(
      (([] as MerchantProfile[]).concat() && []) || []
    );
  }, []);

  const [profilesForNames, setProfilesForNames] = useState<MerchantProfile[]>([]);

  useEffect(() => {
    const loadProfiles = async () => {
      const { data } = await supabase.from("profiles").select("user_id, approved, firma_name, ansprechpartner");
      setProfilesForNames((data as MerchantProfile[] | null) ?? []);
    };

    loadProfiles();
  }, []);

  const merchantNameMap = useMemo(
    () =>
      new Map(
        profilesForNames.map((profile) => [
          profile.user_id,
          profile.firma_name?.trim() || profile.ansprechpartner?.trim() || "Unbekannter Händler",
        ]),
      ),
    [profilesForNames],
  );

  const filteredOrders = useMemo(
    () => (filter === "alle" ? orders : orders.filter((order) => order.status === filter)),
    [filter, orders],
  );

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    const order = orders.find((item) => item.id === selectedOrderId);
    if (!order) return null;

    return {
      id: order.id,
      auftragsNr: order.auftrags_nr,
      absenderName: order.absender_name,
      absenderAdresse: order.absender_adresse ?? "",
      empfaengerName: order.empfaenger_name,
      empfaengerAdresse: order.empfaenger_adresse ?? "",
      empfaengerPlz: order.empfaenger_plz ?? "",
      empfaengerStadt: order.empfaenger_stadt,
      empfaengerEmail: order.empfaenger_email ?? undefined,
      empfaengerTelefon: order.empfaenger_telefon ?? undefined,
      pakete: order.pakete,
      gewicht: Number(order.gewicht),
      packageLengthCm: order.package_length_cm === null ? undefined : Number(order.package_length_cm),
      packageWidthCm: order.package_width_cm === null ? undefined : Number(order.package_width_cm),
      packageHeightCm: order.package_height_cm === null ? undefined : Number(order.package_height_cm),
      status: order.status,
      erstelltAm: new Date(order.created_at).toLocaleDateString("de-DE"),
      notizen: order.notizen ?? undefined,
    };
  }, [orders, selectedOrderId]);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setSheetOpen(true);
  };

  useEffect(() => {
    const loadStatusHistory = async () => {
      if (!selectedOrderId || !sheetOpen) {
        setStatusHistory([]);
        return;
      }

      const { data, error } = await supabase
        .from("order_status_history")
        .select("id, order_id, status, reason, created_at")
        .eq("order_id", selectedOrderId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Order history could not be loaded", error);
        setStatusHistory([]);
        return;
      }

      setStatusHistory((data as OrderHistoryEntry[] | null) ?? []);
    };

    loadStatusHistory();
  }, [selectedOrderId, sheetOpen]);

  const handleUpdateStatus = async (id: string, status: OrderStatus, reason?: string) => {
    const { data, error } = await supabase.rpc("admin_update_order_status", {
      _order_id: id,
      _status: status,
      _reason: reason ?? null,
    });

    if (error) {
      console.error("Order status could not be updated", error);
      return;
    }

    if (data?.id === id) {
      const updatedOrder = data as { status: OrderStatus };
      setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, status: updatedOrder.status } : order)));
    }

    const o = orders.find((x) => x.id === id);
    if (o) {
      void sendOrderStatusEmail({
        orderId: o.id,
        auftragsNr: o.auftrags_nr,
        status,
        empfaengerName: o.empfaenger_name,
        empfaengerEmail: o.empfaenger_email,
        empfaengerAdresse: o.empfaenger_adresse,
        empfaengerPlz: o.empfaenger_plz,
        empfaengerStadt: o.empfaenger_stadt,
        haendlerUserId: o.user_id,
        reason,
      });
    }

    if (status === "nicht_zugestellt" && selectedOrderId === id && reason?.trim()) {
      setStatusHistory((prev) => [
        {
          id: `${id}-${Date.now()}`,
          order_id: id,
          status,
          reason: reason.trim(),
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    } else if (status !== "nicht_zugestellt" && selectedOrderId === id) {
      const { data: refreshedHistory } = await supabase
        .from("order_status_history")
        .select("id, order_id, status, reason, created_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false });

      setStatusHistory((refreshedHistory as OrderHistoryEntry[] | null) ?? []);
    }
  };

  const handleUpdateOrder = async (id: string, updates: Partial<{
    empfaengerName: string;
    empfaengerAdresse: string;
    empfaengerPlz: string;
    empfaengerStadt: string;
    empfaengerEmail?: string;
    empfaengerTelefon?: string;
    pakete: number;
    gewicht: number;
    packageLengthCm?: number;
    packageWidthCm?: number;
    packageHeightCm?: number;
    notizen?: string;
  }>) => {
    const dbUpdates: TablesUpdate<"orders"> = {};
    if (updates.empfaengerName !== undefined) dbUpdates.empfaenger_name = updates.empfaengerName;
    if (updates.empfaengerAdresse !== undefined) dbUpdates.empfaenger_adresse = updates.empfaengerAdresse;
    if (updates.empfaengerPlz !== undefined) dbUpdates.empfaenger_plz = updates.empfaengerPlz;
    if (updates.empfaengerStadt !== undefined) dbUpdates.empfaenger_stadt = updates.empfaengerStadt;
    if (updates.empfaengerEmail !== undefined) dbUpdates.empfaenger_email = updates.empfaengerEmail || null;
    if (updates.empfaengerTelefon !== undefined) dbUpdates.empfaenger_telefon = updates.empfaengerTelefon || null;
    if (updates.pakete !== undefined) dbUpdates.pakete = updates.pakete;
    if (updates.gewicht !== undefined) dbUpdates.gewicht = updates.gewicht;
    if (updates.packageLengthCm !== undefined) dbUpdates.package_length_cm = updates.packageLengthCm ?? null;
    if (updates.packageWidthCm !== undefined) dbUpdates.package_width_cm = updates.packageWidthCm ?? null;
    if (updates.packageHeightCm !== undefined) dbUpdates.package_height_cm = updates.packageHeightCm ?? null;
    if (updates.notizen !== undefined) dbUpdates.notizen = updates.notizen || null;

    const { error } = await supabase.from("orders").update(dbUpdates).eq("id", id);
    if (error) {
      console.error("Order could not be updated", error);
      return;
    }

    setOrders((prev) => prev.map((order) => (
      order.id === id
        ? {
            ...order,
            empfaenger_name: updates.empfaengerName ?? order.empfaenger_name,
            empfaenger_adresse: updates.empfaengerAdresse ?? order.empfaenger_adresse,
            empfaenger_plz: updates.empfaengerPlz ?? order.empfaenger_plz,
            empfaenger_stadt: updates.empfaengerStadt ?? order.empfaenger_stadt,
            empfaenger_email: updates.empfaengerEmail === undefined ? order.empfaenger_email : updates.empfaengerEmail || null,
            empfaenger_telefon: updates.empfaengerTelefon === undefined ? order.empfaenger_telefon : updates.empfaengerTelefon || null,
            pakete: updates.pakete ?? order.pakete,
            gewicht: updates.gewicht ?? order.gewicht,
            package_length_cm: updates.packageLengthCm === undefined ? order.package_length_cm : updates.packageLengthCm ?? null,
            package_width_cm: updates.packageWidthCm === undefined ? order.package_width_cm : updates.packageWidthCm ?? null,
            package_height_cm: updates.packageHeightCm === undefined ? order.package_height_cm : updates.packageHeightCm ?? null,
            notizen: updates.notizen === undefined ? order.notizen : updates.notizen || null,
          }
        : order
    )));
  };

  const cards = [
    { label: "Händler gesamt", value: stats.total, icon: Users, color: "text-primary" },
    { label: "Freigeschaltet", value: stats.approved, icon: UserCheck, color: "text-green-500" },
    { label: "Ausstehend", value: stats.pending, icon: UserX, color: "text-amber-500" },
    { label: "Aufträge gesamt", value: stats.orders, icon: Package, color: "text-blue-500" },
  ];

  return (
    <AdminLayout title="Admin Dashboard">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">Bestellungen</CardTitle>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <Badge variant="secondary" className="w-fit">
              {filteredOrders.length} sichtbar
            </Badge>
            <StatusFilter activeFilter={filter} onFilter={setFilter} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
              Für diesen Status sind aktuell keine Bestellungen vorhanden.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Auftragsnr.</TableHead>
                  <TableHead>Händler</TableHead>
                  <TableHead>Empfänger</TableHead>
                  <TableHead>Stadt</TableHead>
                  <TableHead className="text-center">Pakete</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id} className="cursor-pointer hover:bg-muted/30" onClick={() => handleSelectOrder(order.id)}>
                    <TableCell className="font-medium">{order.auftrags_nr}</TableCell>
                    <TableCell>{merchantNameMap.get(order.user_id) ?? "Unbekannter Händler"}</TableCell>
                    <TableCell>{order.empfaenger_name}</TableCell>
                    <TableCell>{order.empfaenger_stadt}</TableCell>
                    <TableCell className="text-center">{order.pakete}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {dateTimeFormatter.format(new Date(order.created_at))}
                    </TableCell>
                    <TableCell>
                      {order.dhl_tracking_number ? (
                        <Badge variant="secondary" className="border-0 bg-yellow-400 text-yellow-950 hover:bg-yellow-400">
                          DHL
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className={STATUS_COLORS[order.status]}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <OrderDetailSheet
        order={selectedOrder}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdateStatus={handleUpdateStatus}
        onUpdateOrder={handleUpdateOrder}
        canUpdateStatus
        statusHistory={statusHistory.map((entry) => ({
          id: entry.id,
          status: entry.status,
          reason: entry.reason ?? undefined,
          createdAt: dateTimeFormatter.format(new Date(entry.created_at)),
        }))}
      />
    </AdminLayout>
  );
};

export default AdminDashboardPage;
