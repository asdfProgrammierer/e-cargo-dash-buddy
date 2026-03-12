import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ExcelImport } from "@/components/dashboard/ExcelImport";
import { useOrders } from "@/context/OrderContext";

const ImportPage = () => {
  const { addOrders } = useOrders();

  return (
    <DashboardLayout title="Excel Import">
      <div className="mx-auto max-w-3xl">
        <ExcelImport onImport={addOrders} />
      </div>
    </DashboardLayout>
  );
};

export default ImportPage;
