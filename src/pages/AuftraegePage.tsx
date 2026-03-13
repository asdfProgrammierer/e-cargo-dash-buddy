import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { CreateOrderDialog } from "@/components/dashboard/CreateOrderDialog";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { OrderSearch } from "@/components/dashboard/OrderSearch";
import { useOrders } from "@/context/OrderContext";
import { OrderStatus } from "@/types/order";

const AuftraegePage = () => {
  const { orders, addOrder, updateStatus, deleteOrder } = useOrders();
  const [filter, setFilter] = useState<OrderStatus | "alle">("alle");
  const [search, setSearch] = useState("");

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
        <OrderTable orders={filtered} onUpdateStatus={updateStatus} onDelete={deleteOrder} />
      </div>
    </DashboardLayout>
  );
};

export default AuftraegePage;
