import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Printer, Trash2, XCircle, FileDown, Loader2 } from "lucide-react";
import { Order, STATUS_LABELS, STATUS_COLORS } from "@/types/order";
import { printShippingLabels } from "@/lib/shippingLabels";
import { downloadOrderPdf } from "@/lib/orderPdf";
import { useIsMobile } from "@/hooks/use-mobile";

interface OrderTableProps {
  orders: Order[];
  onDelete: (id: string) => void;
  onSelect: (order: Order) => void;
  onCancel?: (id: string) => void | Promise<void>;
}

export function OrderTable({ orders, onDelete, onSelect, onCancel }: OrderTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number | "all">(25);
  const [page, setPage] = useState(1);
  const isMobile = useIsMobile();

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(orders.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const pagedOrders = useMemo(() => {
    if (pageSize === "all") return orders;
    const start = (page - 1) * pageSize;
    return orders.slice(start, start + pageSize);
  }, [orders, page, pageSize]);

  const changePageSize = (val: number | "all") => {
    setPageSize(val);
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map((o) => o.id)));
  };

  const printBulkLabels = async () => {
    const selectedOrders = orders.filter((o) => selected.has(o.id));
    if (selectedOrders.length === 0) return;
    const dhlOrders = selectedOrders.filter((o) => o.dhlLabelUrl);
    const standardOrders = selectedOrders.filter((o) => !o.dhlLabelUrl);
    dhlOrders.forEach((o) => window.open(o.dhlLabelUrl!, "_blank", "noopener,noreferrer"));
    if (standardOrders.length > 0) await printShippingLabels(standardOrders);
    setSelected(new Set());
  };

  const printLabel = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    if (order.dhlLabelUrl) {
      window.open(order.dhlLabelUrl, "_blank", "noopener,noreferrer");
      return;
    }
    await printShippingLabels([order]);
  };

  const downloadPdf = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    if (pdfLoadingId) return;
    setPdfLoadingId(order.id);
    try {
      await downloadOrderPdf(order);
    } catch (err) {
      console.error("PDF-Erstellung fehlgeschlagen", err);
      toast.error("PDF konnte nicht erstellt werden. Bitte erneut versuchen.");
    } finally {
      setPdfLoadingId(null);
    }
  };

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
        <p className="text-muted-foreground">Keine Aufträge gefunden</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-lg bg-primary/10 p-3">
          <span className="text-sm font-medium text-foreground">{selected.size} ausgewählt</span>
          <Button size="sm" variant="outline" onClick={printBulkLabels}>
            <Printer className="mr-2 h-4 w-4" />
            Etiketten drucken ({selected.size})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Auswahl aufheben
          </Button>
        </div>
      )}
      {isMobile ? (
        <div className="space-y-2">
          {pagedOrders.map((order) => (
            <div
              key={order.id}
              onClick={() => onSelect(order)}
              className="rounded-xl border border-border/50 bg-card p-3 space-y-2 active:bg-muted/40 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(order.id)}
                    onCheckedChange={() => toggleSelect(order.id)}
                  />
                  <span className="font-mono text-sm font-medium truncate">{order.auftragsNr}</span>
                  {order.isPickup && (
                    <Badge variant="outline" className="border-warning text-warning text-[10px] uppercase tracking-wide">
                      Abholung
                    </Badge>
                  )}
                </div>
                {order.dhlTrackingNumber ? (
                  <Badge variant="secondary" className="border-0 text-xs bg-yellow-400 text-yellow-950 hover:bg-yellow-400 shrink-0">
                    DHL
                  </Badge>
                ) : (
                  <Badge variant="secondary" className={`${STATUS_COLORS[order.status]} border-0 text-xs shrink-0`}>
                    {STATUS_LABELS[order.status]}
                  </Badge>
                )}
              </div>
              <div className="text-sm">
                <p className="font-medium truncate">{order.empfaengerName}</p>
                <p className="text-xs text-muted-foreground truncate">{order.empfaengerStadt}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{order.pakete} Paket{order.pakete === 1 ? "" : "e"} · {order.gewicht} kg</span>
                <span>{order.erstelltAm}</span>
              </div>
              <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-9 w-9" title="Etikett drucken" onClick={(e) => printLabel(e, order)}>
                  <Printer className="h-4 w-4" />
                </Button>
                {order.status === "neu" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    title="Löschen"
                    onClick={() => onDelete(order.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {order.status === "in_bearbeitung" && onCancel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    title="Stornieren"
                    onClick={() => setCancelTarget(order)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
                {(order.status === "unterwegs" ||
                  order.status === "zugestellt" ||
                  order.status === "nicht_zugestellt" ||
                  order.status === "storniert") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    title="PDF herunterladen"
                    onClick={(e) => downloadPdf(e, order)}
                    disabled={pdfLoadingId === order.id}
                  >
                    {pdfLoadingId === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-10">
                <Checkbox
                  checked={orders.length > 0 && selected.size === orders.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="font-semibold">Auftrags-Nr.</TableHead>
              <TableHead className="font-semibold">Absender</TableHead>
              <TableHead className="font-semibold">Empfänger</TableHead>
              <TableHead className="font-semibold">Stadt</TableHead>
              <TableHead className="font-semibold text-center">Pakete</TableHead>
              <TableHead className="font-semibold text-right">Gewicht</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Datum</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedOrders.map((order) => (
              <TableRow key={order.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(order)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(order.id)}
                    onCheckedChange={() => toggleSelect(order.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <span>{order.auftragsNr}</span>
                    {order.isPickup && (
                      <Badge variant="outline" className="border-warning text-warning text-[10px] uppercase tracking-wide">
                        Abholung
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{order.absenderName}</TableCell>
                <TableCell>{order.empfaengerName}</TableCell>
                <TableCell>{order.empfaengerStadt}</TableCell>
                <TableCell className="text-center">{order.pakete}</TableCell>
                <TableCell className="text-right">{order.gewicht} kg</TableCell>
                <TableCell>
                  {order.dhlTrackingNumber ? (
                    <Badge variant="secondary" className="border-0 text-xs bg-yellow-400 text-yellow-950 hover:bg-yellow-400">
                      DHL
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className={`${STATUS_COLORS[order.status]} border-0 text-xs`}>
                      {STATUS_LABELS[order.status]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{order.erstelltAm}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Etikett drucken"
                      onClick={(e) => printLabel(e, order)}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    {order.status === "neu" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Löschen"
                        onClick={() => onDelete(order.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {order.status === "in_bearbeitung" && onCancel && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Stornieren"
                        onClick={() => setCancelTarget(order)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {(order.status === "unterwegs" ||
                      order.status === "zugestellt" ||
                      order.status === "nicht_zugestellt" ||
                      order.status === "storniert") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="PDF herunterladen"
                        onClick={(e) => downloadPdf(e, order)}
                        disabled={pdfLoadingId === order.id}
                      >
                        {pdfLoadingId === order.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileDown className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="mr-1">Anzeigen:</span>
          {([25, 50, "all"] as const).map((size) => (
            <Button
              key={String(size)}
              variant={pageSize === size ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => changePageSize(size)}
            >
              {size === "all" ? "Alle" : size}
            </Button>
          ))}
        </div>
        {pageSize !== "all" && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Zurück
            </Button>
            <span>
              Seite {page} von {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Weiter
            </Button>
          </div>
        )}
        <div className="text-xs">
          {orders.length} Aufträge gesamt
        </div>
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auftrag stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Auftrag {cancelTarget?.auftragsNr} wird storniert. Sie können ihn anschließend wieder bearbeiten und neu einreichen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (cancelTarget && onCancel) await onCancel(cancelTarget.id);
                setCancelTarget(null);
              }}
            >
              Stornieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
