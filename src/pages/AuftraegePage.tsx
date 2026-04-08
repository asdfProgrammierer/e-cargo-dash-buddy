import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { CreateOrderDialog } from "@/components/dashboard/CreateOrderDialog";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { OrderSearch } from "@/components/dashboard/OrderSearch";
import { Button } from "@/components/ui/button";
import { useOrders } from "@/context/OrderContext";
import { Order, OrderStatus } from "@/types/order";
import { Calendar } from "lucide-react";

type TimeFilter = "heute" | "7tage" | "30tage" | "alle";

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "heute", label: "Heute" },
  { value: "7tage", label: "7 Tage" },
  { value: "30tage", label: "30 Tage" },
  { value: "alle", label: "Alle" },
];

const AuftraegePage = () => {
  const { orders, addOrder, updateStatus, deleteOrder, updateOrder } = useOrders();
  const [filter, setFilter] = useState<OrderStatus | "alle">("alle");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("alle");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = orders;

    // Time filter
    if (timeFilter !== "alle") {
      const now = new Date();
      let cutoff: Date;
      if (timeFilter === "heute") {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (timeFilter === "7tage") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      result = result.filter((o) => new Date(o.erstelltAm) >= cutoff);
    }

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
  }, [orders, filter, timeFilter, search]);

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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5">
              <Calendar className="h-3.5 w-3.5 ml-2 text-muted-foreground" />
              {TIME_FILTERS.map((tf) => (
                <Button
                  key={tf.value}
                  variant={timeFilter === tf.value ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setTimeFilter(tf.value)}
                >
                  {tf.label}
                </Button>
              ))}
            </div>
            <CreateOrderDialog onSubmit={addOrder} />
          </div>
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

export default AuftraegePage;
