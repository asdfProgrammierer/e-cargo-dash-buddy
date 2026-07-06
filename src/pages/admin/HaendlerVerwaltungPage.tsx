import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MerchantInvoiceDialog } from "@/components/admin/MerchantInvoiceDialog";
import { AdminVirtualMerchantDialog } from "@/components/admin/AdminVirtualMerchantDialog";
import { toast } from "sonner";
import { Search, Building2, ChevronRight, Trash2, Download } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MerchantProfile {
  id: string;
  user_id: string;
  firma_name: string | null;
  ansprechpartner: string | null;
  stadt: string | null;
  telefon: string | null;
  paketpreis: number | null;
  merchant_code: string | null;
  approved: boolean;
  pickup_enabled: boolean;
  pickup_weekdays: number[];
  is_virtual: boolean;
  created_at: string;
}

const HaendlerVerwaltungPage = () => {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const exportMerchant = async (profile: MerchantProfile) => {
    setExportingId(profile.id);
    try {
      const { data, error } = await supabase.functions.invoke("gdpr-export-merchant", {
        body: { profile_id: profile.id },
      });
      if (error || !data) throw new Error(error?.message ?? "Export fehlgeschlagen");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gdpr-export-${profile.firma_name || profile.id}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DSGVO-Export heruntergeladen");
    } catch (e: any) {
      toast.error(e.message ?? "Export fehlgeschlagen");
    } finally {
      setExportingId(null);
    }
  };

  const fetchMerchants = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, firma_name, ansprechpartner, stadt, telefon, paketpreis, merchant_code, approved, pickup_enabled, pickup_weekdays, is_virtual, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Fehler beim Laden der Händler");
    } else {
      const merchantRows = (data ?? []).map((m: any) => ({
        ...m,
        pickup_enabled: m.pickup_enabled ?? false,
        pickup_weekdays: Array.isArray(m.pickup_weekdays) ? m.pickup_weekdays : [],
        is_virtual: m.is_virtual ?? false,
      })) as MerchantProfile[];
      setMerchants(merchantRows);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMerchants();
  }, []);

  const toggleApproval = async (profile: MerchantProfile) => {
    const newVal = !profile.approved;
    const { error } = await supabase
      .from("profiles")
      .update({ approved: newVal })
      .eq("id", profile.id);
    if (error) {
      toast.error("Fehler beim Aktualisieren");
    } else {
      setMerchants((prev) =>
        prev.map((m) => (m.id === profile.id ? { ...m, approved: newVal } : m))
      );
      toast.success(newVal ? "Händler freigeschaltet" : "Händler gesperrt");
    }
  };

  const filtered = merchants.filter((m) => {
    const q = search.toLowerCase();
    return (
      !q ||
      m.merchant_code?.toLowerCase().includes(q) ||
      m.firma_name?.toLowerCase().includes(q) ||
      m.ansprechpartner?.toLowerCase().includes(q) ||
      m.stadt?.toLowerCase().includes(q)
    );
  });

  const deleteMerchant = async (profile: MerchantProfile) => {
    setDeletingId(profile.id);
    const { data, error } = await supabase.functions.invoke("admin-delete-merchant", {
      body: { profile_id: profile.id },
    });
    setDeletingId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Löschen fehlgeschlagen");
      return;
    }
    setMerchants((prev) => prev.filter((m) => m.id !== profile.id));
    toast.success("Händler gelöscht");
  };

  return (
    <AdminLayout title="Händlerverwaltung">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Händler suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <AdminVirtualMerchantDialog onCreated={fetchMerchants} />
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead>Ansprechpartner</TableHead>
                <TableHead>Stadt</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Paketpreis</TableHead>
                <TableHead>Registriert am</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rechnung</TableHead>
                <TableHead className="text-right">Freigabe</TableHead>
                <TableHead className="w-12 text-right">Löschen</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Lade Händler...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Keine Händler gefunden
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => (
                  <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/admin/haendler/${m.id}`)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {m.firma_name || "–"}
                        {m.is_virtual && (
                          <Badge variant="outline" className="text-xs">Intern</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{m.ansprechpartner || "–"}</TableCell>
                    <TableCell>{m.stadt || "–"}</TableCell>
                    <TableCell>{m.telefon || "–"}</TableCell>
                     <TableCell>
                       {m.paketpreis != null
                         ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(m.paketpreis)
                         : "–"}
                     </TableCell>
                    <TableCell>
                      {new Date(m.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.approved ? "default" : "secondary"}>
                        {m.approved ? "Aktiv" : "Ausstehend"}
                      </Badge>
                    </TableCell>
                     <TableCell onClick={(e) => e.stopPropagation()}>
                       <MerchantInvoiceDialog merchant={m} />
                     </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={m.approved}
                        onCheckedChange={() => toggleApproval(m)}
                      />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={deletingId === m.id}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Händler endgültig löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {m.firma_name || m.ansprechpartner || "Dieser Händler"} und alle zugehörigen Daten
                              (Aufträge, Adressbuch, Sub-Accounts, Shop-Verbindungen) werden unwiderruflich gelöscht.
                              Für die DSGVO-Auskunft bitte vorher „DSGVO-Export“ herunterladen.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMerchant(m)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={exportingId === m.id}
                        onClick={() => exportMerchant(m)}
                        title="DSGVO-Export (JSON)"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="w-8">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default HaendlerVerwaltungPage;
