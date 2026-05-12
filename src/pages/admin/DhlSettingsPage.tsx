import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DhlPricingTable } from "@/components/admin/DhlPricingTable";

export default function DhlSettingsPage() {
  return (
    <AdminLayout title="Einstellungen">
      <div className="space-y-6">
        <SettingsTabs />
        <Card>
          <CardHeader>
            <CardTitle>Globale Default-Preise (netto, €)</CardTitle>
            <CardDescription>
              Diese Preise gelten für alle Händler – außer ein Händler hat einen individuellen Override im Händler-Detail.
              Sender-Adresse: <span className="font-mono">Haldenstraße 58, 44809 Bochum</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DhlPricingTable editGlobal />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}