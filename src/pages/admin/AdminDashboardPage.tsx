import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, UserCheck, UserX, Package } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS, type OrderStatus } from "@/types/order";

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
  empfaenger_name: string;
  empfaenger_stadt: string;
  pakete: number;
  status: OrderStatus;
  created_at: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
});

const AdminDashboardPage = () => {
  const [stats, setStats] = useState<DashboardStats>({ total: 0, approved: 0, pending: 0, orders: 0 });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: profiles, error: profilesError }, { count: orderCount, error: ordersCountError }, { data: newOrders, error: newOrdersError }] = await Promise.all([
        supabase.from("profiles").select("user_id, approved, firma_name, ansprechpartner"),
        supabase.from("orders").select("*", { count: "exact", head: true }),
        supabase
          .from("orders")
          .select("id, user_id, auftrags_nr, empfaenger_name, empfaenger_stadt, pakete, status, created_at")
          .eq("status", "neu")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (profilesError || ordersCountError || newOrdersError) {
        console.error("Admin dashboard data could not be loaded", { profilesError, ordersCountError, newOrdersError });
      }

      const total = profiles?.length ?? 0;
      const approved = profiles?.filter((p) => p.approved).length ?? 0;

      setStats({ total, approved, pending: total - approved, orders: orderCount ?? 0 });
      setRecentOrders((newOrders as RecentOrder[] | null) ?? []);
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
            <CardTitle className="text-xl">Neue Bestellungen</CardTitle>
            <CardDescription>Die zuletzt eingegangenen Aufträge aller Händler mit direkter Händlerzuordnung.</CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit">
            {recentOrders.length} neu
          </Badge>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
              Aktuell sind keine neuen Bestellungen vorhanden.
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
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.auftrags_nr}</TableCell>
                    <TableCell>{merchantNameMap.get(order.user_id) ?? "Unbekannter Händler"}</TableCell>
                    <TableCell>{order.empfaenger_name}</TableCell>
                    <TableCell>{order.empfaenger_stadt}</TableCell>
                    <TableCell className="text-center">{order.pakete}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {dateTimeFormatter.format(new Date(order.created_at))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_COLORS[order.status]}>
                        {STATUS_LABELS[order.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminDashboardPage;
