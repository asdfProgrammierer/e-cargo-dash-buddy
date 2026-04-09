import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, Package } from "lucide-react";

const AdminDashboardPage = () => {
  const [stats, setStats] = useState({ total: 0, approved: 0, pending: 0, orders: 0 });

  useEffect(() => {
    const load = async () => {
      const { data: profiles } = await supabase.from("profiles").select("approved");
      const { count: orderCount } = await supabase.from("orders").select("*", { count: "exact", head: true });
      const total = profiles?.length ?? 0;
      const approved = profiles?.filter((p) => p.approved).length ?? 0;
      setStats({ total, approved, pending: total - approved, orders: orderCount ?? 0 });
    };
    load();
  }, []);

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
    </AdminLayout>
  );
};

export default AdminDashboardPage;
