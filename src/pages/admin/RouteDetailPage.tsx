import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { RouteBuilder } from "@/components/admin/RouteBuilder";

const RouteDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return null;
  return (
    <AdminLayout title="Route">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/routen")}>
          <ArrowLeft className="mr-2 h-4 w-4" />Zurück
        </Button>
        <RouteBuilder routeId={id} />
      </div>
    </AdminLayout>
  );
};

export default RouteDetailPage;
