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
import { geocodeAndSaveOrder } from "@/lib/geocodeOrder";
import { ExcelImport } from "@/components/dashboard/ExcelImport";
import type { Order } from "@/types/order";
import { sendOrderStatusEmailsForIds } from "@/lib/orderEmail";
import { orderCreationError } from "@/lib/orderCreationError";

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
      toast.error(orderCreationError(error, "Import fehlgeschlagen"));
      return [];
    }
    const created = data ?? [];
    toast.success(`${created.length} Aufträge importiert`);
    // Status-Mails (status "neu") für alle neuen Aufträge auslösen
    if (created.length > 0) {
      void sendOrderStatusEmailsForIds(created.map((r) => r.id as string), "neu");
    }
    // Trigger geocoding in background
    for (const row of created) {
      void geocodeAndSaveOrder(row.id as string, {
        strasse: row.empfaenger_adresse as string | null,
        plz: row.empfaenger_plz as string | null,
        stadt: row.empfaenger_stadt as string | null,
      }).catch(() => undefined);
    }
    onCreated?.(created.length);
    setOpen(false);
    return created;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FileSpreadsheet className="h-4 w-4" />
          Excel-Import
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] min-w-0 flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>
            Excel-Import{merchantLabel ? ` für ${merchantLabel}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 min-w-0 overflow-y-auto pt-2">
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