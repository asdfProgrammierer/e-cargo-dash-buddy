import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { CreateOrderDialog } from "@/components/dashboard/CreateOrderDialog";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { OrderSearch } from "@/components/dashboard/OrderSearch";
import { useOrders } from "@/context/OrderContext";
import { Order, OrderStatus } from "@/types/order";

const AuftraegePage = () => {
  const { orders, addOrder, updateStatus, deleteOrder, updateOrder } = useOrders();
  // Note: updateStatus is only used by OrderDetailSheet, not exposed in OrderTable
  const [filter, setFilter] = useState<OrderStatus | "alle">("alle");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = orders;
    if (filter !== "alle") result = result.filter((o) => o.status === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.auftragsNr.toLowerCase().includes(s) ||
          o.absenderName.toLowerCase().includes(s) ||
          o.empfaengerName.toLowerCase().includes(s) ||
          o.empfaengerStadt.toLowerCase().includes(s)
      );
    }
    return result;
  }, [orders, filter, search]);

  // Keep selected order in sync with store
  const currentOrder = selectedOrder
    ? orders.find((o) => o.id === selectedOrder.id) ?? null
    : null;

  const handleSelect = (order: Order) => {
    setSelectedOrder(order);
    setSheetOpen(true);
  };

  return (
    <DashboardLayout title="Aufträge">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <OrderSearch value={search} onChange={setSearch} />
            <StatusFilter activeFilter={filter} onFilter={setFilter} />
          </div>
          <CreateOrderDialog onSubmit={addOrder} />
        </div>
        <OrderTable
          orders={filtered}
          onUpdateStatus={updateStatus}
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

export default AuftraegePage;
