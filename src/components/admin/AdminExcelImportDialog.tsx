import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ExcelImport } from "@/components/dashboard/ExcelImport";
import type { Order } from "@/types/order";

interface Props {
  merchantUserId: string;
  merchantLabel?: string;
  senderName: string;
  senderAddress: string;
  onCreated?: (count: number) => void;
}

type NewOrder = Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">;

export function AdminExcelImportDialog({
  merchantUserId,
  merchantLabel,
  senderName,
  senderAddress,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);

  const handleImport = async (rows: NewOrder[]) => {
    if (rows.length === 0) return;
    const payload = rows.map((o) => ({
      user_id: merchantUserId,
      auftrags_nr: "",
      absender_name: o.absenderName,
      absender_adresse: o.absenderAdresse,
      empfaenger_name: o.empfaengerName,
      empfaenger_adresse: o.empfaengerAdresse,
      empfaenger_plz: o.empfaengerPlz,
      empfaenger_stadt: o.empfaengerStadt,
      empfaenger_email: o.empfaengerEmail || null,
      empfaenger_telefon: o.empfaengerTelefon || null,
      pakete: o.pakete,
      gewicht: o.gewicht,
      package_length_cm: o.packageLengthCm ?? null,
      package_width_cm: o.packageWidthCm ?? null,
      package_height_cm: o.packageHeightCm ?? null,
      notizen: o.notizen || null,
    }));
    const { data, error } = await supabase.from("orders").insert(payload).select("id, empfaenger_stadt, empfaenger_plz, empfaenger_adresse");
    if (error) {
      toast.error(`Import fehlgeschlagen: ${error.message}`);
      return;
    }
    const created = data ?? [];
    toast.success(`${created.length} Aufträge importiert`);
    // Trigger geocoding in background
    for (const row of created) {
      void supabase.functions.invoke("geocode-address", {
        body: {
          strasse: row.empfaenger_adresse ?? "",
          plz: row.empfaenger_plz ?? "",
          stadt: row.empfaenger_stadt ?? "",
        },
      }).then(({ data: geo, error: gErr }) => {
        if (gErr || !geo || (geo as { error?: string }).error) return;
        const g = geo as { lat: number; lng: number };
        void supabase
          .from("orders")
          .update({ lat: g.lat, lng: g.lng, geocoded_at: new Date().toISOString() })
          .eq("id", row.id);
      });
    }
    onCreated?.(created.length);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FileSpreadsheet className="h-4 w-4" />
          Excel-Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Excel-Import{merchantLabel ? ` für ${merchantLabel}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <ExcelImport
            onImport={handleImport}
            merchantIdOverride={merchantUserId}
            senderOverride={{ name: senderName, adresse: senderAddress }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}