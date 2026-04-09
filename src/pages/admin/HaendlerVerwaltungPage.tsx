import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Building2 } from "lucide-react";

interface MerchantProfile {
  id: string;
  user_id: string;
  firma_name: string | null;
  ansprechpartner: string | null;
  stadt: string | null;
  telefon: string | null;
  approved: boolean;
  created_at: string;
}

const HaendlerVerwaltungPage = () => {
  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchMerchants = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, firma_name, ansprechpartner, stadt, telefon, approved, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Fehler beim Laden der Händler");
    } else {
      setMerchants(data ?? []);
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
      m.firma_name?.toLowerCase().includes(q) ||
      m.ansprechpartner?.toLowerCase().includes(q) ||
      m.stadt?.toLowerCase().includes(q)
    );
  });

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
                <TableHead>Registriert am</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Freigabe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Lade Händler...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Keine Händler gefunden
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => (
                  <TableRow key={m.id}>
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
                      {new Date(m.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.approved ? "default" : "secondary"}>
                        {m.approved ? "Aktiv" : "Ausstehend"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={m.approved}
                        onCheckedChange={() => toggleApproval(m)}
                      />
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
