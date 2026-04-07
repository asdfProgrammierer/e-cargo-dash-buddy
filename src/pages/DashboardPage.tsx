import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { CreateOrderDialog } from "@/components/dashboard/CreateOrderDialog";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { useOrders } from "@/context/OrderContext";
import { Order, OrderStatus } from "@/types/order";

const DashboardPage = () => {
  const { orders, addOrder, updateStatus, deleteOrder, updateOrder } = useOrders();
  const [filter, setFilter] = useState<OrderStatus | "alle">("alle");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = filter === "alle" ? orders : orders.filter((o) => o.status === filter);

  const currentOrder = selectedOrder
    ? orders.find((o) => o.id === selectedOrder.id) ?? null
    : null;

  const handleSelect = (order: Order) => {
    setSelectedOrder(order);
    setSheetOpen(true);
  };

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        <DashboardStats orders={orders} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <StatusFilter activeFilter={filter} onFilter={setFilter} />
          <CreateOrderDialog onSubmit={addOrder} />
        </div>
        <OrderTable
          orders={filtered}
          onDelete={deleteOrder}
          onSelect={handleSelect}
        />
      </div>

      <OrderDetailSheet
        order={currentOrder}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdateStatus={updateStatus}
        onUpdateOrder={updateOrder}
      />
    </DashboardLayout>
  );
};

export default DashboardPage;
