import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { CreateOrderDialog } from "@/components/dashboard/CreateOrderDialog";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { useOrderStore } from "@/stores/orderStore";
import { OrderStatus } from "@/types/order";

const DashboardPage = () => {
  const { orders, addOrder, updateStatus, deleteOrder } = useOrderStore();
  const [filter, setFilter] = useState<OrderStatus | "alle">("alle");

  const filtered = filter === "alle" ? orders : orders.filter((o) => o.status === filter);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="flex h-14 items-center gap-4 border-b border-border/50 bg-card px-6">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          </header>
          <main className="flex-1 space-y-6 p-6">
            <StatsCards orders={orders} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <StatusFilter activeFilter={filter} onFilter={setFilter} />
              <CreateOrderDialog onSubmit={addOrder} />
            </div>
            <OrderTable orders={filtered} onUpdateStatus={updateStatus} onDelete={deleteOrder} />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardPage;
