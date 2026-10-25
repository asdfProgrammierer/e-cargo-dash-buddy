import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { RouteBuilder } from "@/components/admin/RouteBuilder";
import { RouteProfitPanel, type StopMarginInfo } from "@/components/admin/RouteProfitPanel";
import { generateRoutePrintPdf, type RoutePrintData } from "@/lib/routePrint";

const RouteDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [printing, setPrinting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [stopMargins, setStopMargins] = useState<Record<string, StopMarginInfo>>({});

  if (!id) return null;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const { data, error } = await supabase
        .from("routes")
        .select("id, name, datum, start_time, drivers(name), vehicles(kennzeichen)")
        .eq("id", id)
        .single();
      if (error || !data) throw error ?? new Error("Route nicht gefunden");
      await generateRoutePrintPdf(data as unknown as RoutePrintData);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "PDF konnte nicht erstellt werden");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <AdminLayout title="Route">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/routen")}>
            <ArrowLeft className="mr-2 h-4 w-4" />Zurück
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={printing}>
            <Printer className="mr-2 h-4 w-4" />
            {printing ? "Bereite Druck vor..." : "Drucken"}
          </Button>
        </div>
        <RouteBuilder
          routeId={id}
          onOptimized={() => setRefresh((n) => n + 1)}
          onStopsChanged={() => setRefresh((n) => n + 1)}
          stopMargins={stopMargins}
          belowMap={<RouteProfitPanel routeId={id} refreshKey={refresh} onStopMargins={setStopMargins} />}
        />
      </div>
    </AdminLayout>
  );
};

export default RouteDetailPage;
