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
import { PickupSettingsCell } from "@/components/admin/PickupSettingsCell";
import { toast } from "sonner";
import { Search, Building2, ChevronRight, Trash2 } from "lucide-react";
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
  created_at: string;
}

const HaendlerVerwaltungPage = () => {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [merchantCodes, setMerchantCodes] = useState<Record<string, string>>({});
  const [savingCodeId, setSavingCodeId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMerchants = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, firma_name, ansprechpartner, stadt, telefon, paketpreis, merchant_code, approved, pickup_enabled, pickup_weekdays, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Fehler beim Laden der Händler");
    } else {
      const merchantRows = (data ?? []).map((m: any) => ({
        ...m,
        pickup_enabled: m.pickup_enabled ?? false,
        pickup_weekdays: Array.isArray(m.pickup_weekdays) ? m.pickup_weekdays : [],
      })) as MerchantProfile[];
      setMerchants(merchantRows);
      setMerchantCodes(
        merchantRows.reduce<Record<string, string>>((acc, merchant) => {
          acc[merchant.id] = merchant.merchant_code ?? "";
          return acc;
        }, {})
      );
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

  const saveMerchantCode = async (profile: MerchantProfile) => {
    const normalizedCode = (merchantCodes[profile.id] ?? "").trim().toUpperCase();

    if (!/^[A-Z0-9]{3}$/.test(normalizedCode)) {
      toast.error("Der Händlercode muss genau 3 Zeichen haben");
      return;
    }

    setSavingCodeId(profile.id);
    const { data, error } = await (supabase as any).rpc("admin_set_merchant_code", {
      _profile_id: profile.id,
      _merchant_code: normalizedCode,
    });
    setSavingCodeId(null);

    if (error) {
      toast.error(error.message?.includes("duplicate") ? "Dieser Händlercode ist bereits vergeben" : "Händlercode konnte nicht gespeichert werden");
      return;
    }

    const savedCode = typeof data === "string" ? data : normalizedCode;
    setMerchantCodes((prev) => ({ ...prev, [profile.id]: savedCode }));
    setMerchants((prev) => prev.map((merchant) => (
      merchant.id === profile.id ? { ...merchant, merchant_code: savedCode } : merchant
    )));
    toast.success("Händlercode gespeichert und Aufträge neu nummeriert");
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
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Händler suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
                <TableHead>Code</TableHead>
                <TableHead>Registriert am</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Abholung</TableHead>
                <TableHead>Rechnung</TableHead>
                <TableHead className="text-right">Freigabe</TableHead>
                <TableHead className="w-12 text-right">Löschen</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                    Lade Händler...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
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
                     <TableCell onClick={(e) => e.stopPropagation()}>
                       <div className="flex min-w-[180px] items-center gap-2">
                         <Input
                           value={merchantCodes[m.id] ?? ""}
                           onChange={(e) => setMerchantCodes((prev) => ({
                             ...prev,
                             [m.id]: e.target.value.toUpperCase().slice(0, 3),
                           }))}
                           placeholder="PMF"
                           className="h-8 uppercase"
                         />
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           onClick={() => saveMerchantCode(m)}
                           disabled={savingCodeId === m.id}
                         >
                           {savingCodeId === m.id ? "..." : "Speichern"}
                         </Button>
                       </div>
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
                       <PickupSettingsCell
                         profileId={m.id}
                         pickupEnabled={m.pickup_enabled}
                         pickupWeekdays={m.pickup_weekdays}
                         onChange={(next) =>
                           setMerchants((prev) =>
                             prev.map((row) =>
                               row.id === m.id
                                 ? { ...row, pickup_enabled: next.pickup_enabled, pickup_weekdays: next.pickup_weekdays }
                                 : row,
                             ),
                           )
                         }
                       />
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
