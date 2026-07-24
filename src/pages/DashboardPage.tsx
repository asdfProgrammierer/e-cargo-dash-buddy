import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHead } from "@/components/PageHead";
import { DashboardStats, filterByRange, type TimeRange } from "@/components/dashboard/DashboardStats";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { MerchantAnalytics } from "@/components/dashboard/MerchantAnalytics";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { CreateOrderDialog } from "@/components/dashboard/CreateOrderDialog";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { useOrders } from "@/context/OrderContext";
import { Order, OrderStatus } from "@/types/order";

const DashboardPage = () => {
  const { orders, addOrder, updateStatus, deleteOrder, updateOrder } = useOrders();
  const { user, isSubAccount } = useAuth();
  const [profileCheck, setProfileCheck] = useState<"loading" | "complete" | "incomplete">("loading");

  useEffect(() => {
    if (!user) return;
    if (isSubAccount) {
      setProfileCheck("complete");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("firma_name, strasse, plz, stadt")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const complete = !!(data?.firma_name && data?.strasse && data?.plz && data?.stadt);
      setProfileCheck(complete ? "complete" : "incomplete");
    })();
    return () => { cancelled = true; };
  }, [user, isSubAccount]);

  const [filter, setFilter] = useState<OrderStatus | "alle">("alle");
  const [range, setRange] = useState<TimeRange>("alle");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const timeFiltered = useMemo(() => filterByRange(orders, range), [orders, range]);
  const filtered = filter === "alle" ? timeFiltered : timeFiltered.filter((o) => o.status === filter);

  const currentOrder = selectedOrder
    ? orders.find((o) => o.id === selectedOrder.id) ?? null
    : null;

  const handleSelect = (order: Order) => {
    setSelectedOrder(order);
    setSheetOpen(true);
  };

  if (profileCheck === "incomplete") {
    return <Navigate to="/profil?welcome=1" replace />;
  }

  return (
    <DashboardLayout title="Dashboard">
      <PageHead title="Dashboard – e-cargo Händler" description="Ihr e-cargo Händler-Dashboard: aktuelle Aufträge, Sendungsstatus, Analytics und CO₂-Einsparungen der nachhaltigen Kurierlogistik im Ruhrgebiet." path="/" />
      <div className="space-y-6">
        <DashboardStats orders={orders} range={range} onRangeChange={setRange} />
        <MerchantAnalytics />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <StatusFilter activeFilter={filter} onFilter={setFilter} />
          <CreateOrderDialog onSubmit={addOrder} />
        </div>
        <OrderTable
          orders={filtered}
          onDelete={deleteOrder}
          onSelect={handleSelect}
          onCancel={(id) => updateStatus(id, "storniert")}
        />
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

export default DashboardPage;
