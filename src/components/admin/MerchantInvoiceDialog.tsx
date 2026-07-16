import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calculator, Download, FileText } from "lucide-react";

interface MerchantInvoiceDialogProps {
  merchant: {
    id: string;
    user_id: string;
    firma_name: string | null;
    ansprechpartner: string | null;
    paketpreis: number | null;
  };
}

interface InvoiceOrder {
  id: string;
  auftrags_nr: string;
  empfaenger_name: string;
  pakete: number;
  delivered_at: string | null;
  status: string;
  updated_at: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);

const toDateValue = (date: Date) => date.toISOString().slice(0, 10);

const startOfDayIso = (value: string) => `${value}T00:00:00.000Z`;
const endOfDayIso = (value: string) => `${value}T23:59:59.999Z`;

export function MerchantInvoiceDialog({ merchant }: MerchantInvoiceDialogProps) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(toDateValue(monthStart));
  const [endDate, setEndDate] = useState(toDateValue(today));
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<InvoiceOrder[]>([]);
  const packagePrice = merchant.paketpreis ?? 0;

  const summary = useMemo(() => {
    const totalPackages = orders.reduce((sum, order) => sum + order.pakete, 0);
    const totalAmount = totalPackages * packagePrice;
    return { totalPackages, totalAmount, orderCount: orders.length };
  }, [orders, packagePrice]);

  const loadInvoicePreview = async () => {
    if (!startDate || !endDate) {
      toast.error("Bitte Zeitraum auswählen");
      return;
    }

    if (startDate > endDate) {
      toast.error("Das Startdatum muss vor dem Enddatum liegen");
      return;
    }

    if (!merchant.paketpreis || merchant.paketpreis <= 0) {
      toast.error("Bitte zuerst einen Paketpreis beim Händler hinterlegen");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select("id, auftrags_nr, empfaenger_name, pakete, delivered_at, status, updated_at")
      .eq("user_id", merchant.user_id)
      .eq("is_pickup", false)
      .in("status", ["zugestellt", "nicht_zugestellt"])
      .or(
        `and(status.eq.zugestellt,delivered_at.gte.${startOfDayIso(startDate)},delivered_at.lte.${endOfDayIso(endDate)}),` +
          `and(status.eq.nicht_zugestellt,updated_at.gte.${startOfDayIso(startDate)},updated_at.lte.${endOfDayIso(endDate)})`
      )
      .order("updated_at", { ascending: true });

    setLoading(false);

    if (error) {
      toast.error("Rechnungsdaten konnten nicht geladen werden");
      return;
    }

    setOrders((data as InvoiceOrder[]) ?? []);
  };

  const downloadPdf = () => {
    if (!orders.length) {
      toast.error("Bitte zuerst eine Rechnungs-Vorschau erstellen");
      return;
    }

    const doc = new jsPDF();
    const merchantName = merchant.firma_name || merchant.ansprechpartner || "Händler";
    const createdAt = new Date().toLocaleDateString("de-DE");

    doc.setFontSize(18);
    doc.text("Auftragsaufzählung", 14, 18);
    doc.setFontSize(11);
    doc.text(`Händler: ${merchantName}`, 14, 28);
    doc.text(`Zeitraum: ${startDate} bis ${endDate}`, 14, 35);
    doc.text(`Erstellt am: ${createdAt}`, 14, 42);

    autoTable(doc, {
      startY: 52,
      head: [["Auftrag", "Datum", "Status", "Pakete", "Preis", "Summe"]],
      body: orders.map((order) => [
        order.auftrags_nr,
        (() => {
          const date = order.status === "zugestellt" ? order.delivered_at : order.updated_at;
          return date ? new Date(date).toLocaleDateString("de-DE") : "–";
        })(),
        order.status === "zugestellt" ? "Zugestellt" : "Nicht zugestellt",
        String(order.pakete),
        formatCurrency(packagePrice),
        formatCurrency(order.pakete * packagePrice),
      ]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 70;
    doc.text(`Gelieferte Pakete: ${summary.totalPackages}`, 14, finalY + 12);
    doc.setFontSize(13);
    doc.text(`Gesamtbetrag: ${formatCurrency(summary.totalAmount)}`, 14, finalY + 22);

    doc.save(`auftragsaufzaehlung-${merchantName.toLowerCase().replace(/\s+/g, "-")}-${startDate}-${endDate}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="h-4 w-4" />
          Auftragsaufzählung
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Auftragsaufzählung erstellen</DialogTitle>
          <DialogDescription>
            Aufträge für {merchant.firma_name || merchant.ansprechpartner || "diesen Händler"} im gewählten Zeitraum auflisten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <Label>Von</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Bis</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1.5" />
            </div>
            <Button onClick={loadInvoicePreview} disabled={loading} className="gap-2">
              <Calculator className="h-4 w-4" />
              {loading ? "Lädt..." : "Vorschau laden"}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Paketpreis</p>
              <p className="mt-1 text-lg font-semibold">
                {merchant.paketpreis ? formatCurrency(merchant.paketpreis) : "Nicht hinterlegt"}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Aufträge</p>
              <p className="mt-1 text-lg font-semibold">{summary.orderCount}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Pakete</p>
              <p className="mt-1 text-lg font-semibold">{summary.totalPackages}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Gesamtbetrag</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(summary.totalAmount)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Status</p>
              <div className="flex items-center gap-2">
                <Badge variant={orders.length ? "default" : "secondary"}>
                  {orders.length ? "Vorschau bereit" : "Noch keine Vorschau"}
                </Badge>
                {!merchant.paketpreis && <span className="text-sm text-muted-foreground">Preis fehlt</span>}
              </div>
            </div>
            <Button onClick={downloadPdf} disabled={!orders.length} className="gap-2">
              <Download className="h-4 w-4" />
              PDF herunterladen
            </Button>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Auftrag</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pakete</TableHead>
                  <TableHead>Preis/Paket</TableHead>
                  <TableHead>Summe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!orders.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Noch keine Daten geladen
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.auftrags_nr}</TableCell>
                      <TableCell>
                        {(() => {
                          const date = order.status === "zugestellt" ? order.delivered_at : order.updated_at;
                          return date ? new Date(date).toLocaleDateString("de-DE") : "–";
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.status === "zugestellt" ? "default" : "secondary"}>
                          {order.status === "zugestellt" ? "Zugestellt" : "Nicht zugestellt"}
                        </Badge>
                      </TableCell>
                      <TableCell>{order.pakete}</TableCell>
                      <TableCell>{formatCurrency(packagePrice)}</TableCell>
                      <TableCell>{formatCurrency(order.pakete * packagePrice)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}