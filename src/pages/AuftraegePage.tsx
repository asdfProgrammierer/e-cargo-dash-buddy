import { useState, useMemo } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { CreateOrderDialog } from "@/components/dashboard/CreateOrderDialog";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { OrderSearch } from "@/components/dashboard/OrderSearch";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrders } from "@/context/OrderContext";
import { Order, OrderStatus } from "@/types/order";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

type TimeFilter = "heute" | "7tage" | "30tage" | "custom";

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "heute", label: "Heute" },
  { value: "7tage", label: "7 Tage" },
  { value: "30tage", label: "30 Tage" },
];

const AuftraegePage = () => {
  const { orders, addOrder, updateStatus, deleteOrder, updateOrder } = useOrders();
  const [filter, setFilter] = useState<OrderStatus | "alle">("alle");
  const [timeFilter, setTimeFilter] = useState<TimeFilter | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleTimeFilter = (tf: TimeFilter) => {
    setTimeFilter(tf === timeFilter ? null : tf);
    setDateRange(undefined);
  };

  const handleDateRange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from) setTimeFilter("custom");
  };

  const clearDateFilter = () => {
    setTimeFilter(null);
    setDateRange(undefined);
  };

  const filtered = useMemo(() => {
    let result = orders;

    if (timeFilter && timeFilter !== "custom") {
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
    } else if (timeFilter === "custom" && dateRange?.from) {
      const from = new Date(dateRange.from);
      from.setHours(0, 0, 0, 0);
      result = result.filter((o) => new Date(o.erstelltAm) >= from);
      if (dateRange.to) {
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999);
        result = result.filter((o) => new Date(o.erstelltAm) <= to);
      }
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
  }, [orders, filter, timeFilter, dateRange, search]);

  const currentOrder = selectedOrder
    ? orders.find((o) => o.id === selectedOrder.id) ?? null
    : null;

  const handleSelect = (order: Order) => {
    setSelectedOrder(order);
    setSheetOpen(true);
  };

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "dd.MM.", { locale: de })} – ${format(dateRange.to, "dd.MM.yy", { locale: de })}`
      : `Ab ${format(dateRange.from, "dd.MM.yy", { locale: de })}`
    : null;

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
              {TIME_FILTERS.map((tf) => (
                <Button
                  key={tf.value}
                  variant={timeFilter === tf.value ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => handleTimeFilter(tf.value)}
                >
                  {tf.label}
                </Button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={timeFilter === "custom" ? "default" : "ghost"}
                    size="sm"
                    className={cn("h-7 text-xs px-2.5 gap-1")}
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateLabel ?? "Zeitraum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={handleDateRange}
                    numberOfMonths={2}
                    locale={de}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {timeFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={clearDateFilter}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
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
