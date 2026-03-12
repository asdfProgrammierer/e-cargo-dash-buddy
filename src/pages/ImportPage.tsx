import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { ExcelImport } from "@/components/dashboard/ExcelImport";
import { useOrders } from "@/context/OrderContext";

const ImportPage = () => {
  const { addOrders } = useOrders();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="flex h-14 items-center gap-4 border-b border-border/50 bg-card px-6">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold text-foreground">Excel Import</h1>
          </header>
          <main className="flex-1 p-6">
            <div className="mx-auto max-w-3xl">
              <ExcelImport onImport={addOrders} />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ImportPage;
