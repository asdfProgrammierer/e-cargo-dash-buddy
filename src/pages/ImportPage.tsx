import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHead } from "@/components/PageHead";
import { ExcelImport } from "@/components/dashboard/ExcelImport";
import { useOrders } from "@/context/OrderContext";

const ImportPage = () => {
  const { addOrders } = useOrders();

  return (
    <DashboardLayout title="Excel Import">
      <PageHead title="Excel Import – e-cargo Händler-Dashboard" description="Importieren Sie Ihre Kurieraufträge im Bulk aus Excel- oder CSV-Dateien direkt in das e-cargo Händler-Dashboard." path="/import" />
      <div className="mx-auto max-w-3xl">
        <ExcelImport onImport={addOrders} />
      </div>
    </DashboardLayout>
  );
};

export default ImportPage;
