import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { CreateOrderDialog } from "@/components/dashboard/CreateOrderDialog";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { useOrders } from "@/context/OrderContext";
import { OrderStatus } from "@/types/order";

const AuftraegePage = () => {
  const { orders, addOrder, updateStatus, deleteOrder } = useOrders();
  const [filter, setFilter] = useState<OrderStatus | "alle">("alle");
  const filtered = filter === "alle" ? orders : orders.filter((o) => o.status === filter);

  return (
    <DashboardLayout title="Aufträge">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <StatusFilter activeFilter={filter} onFilter={setFilter} />
          <CreateOrderDialog onSubmit={addOrder} />
        </div>
        <OrderTable orders={filtered} onUpdateStatus={updateStatus} onDelete={deleteOrder} />
      </div>
    </DashboardLayout>
  );
};

export default AuftraegePage;
