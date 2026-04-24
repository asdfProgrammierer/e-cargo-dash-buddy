import { useState } from "react";
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
import { Printer, Trash2, XCircle, FileDown } from "lucide-react";
import { Order, STATUS_LABELS, STATUS_COLORS } from "@/types/order";
import { printShippingLabels } from "@/lib/shippingLabels";
import { downloadOrderPdf } from "@/lib/orderPdf";

interface OrderTableProps {
  orders: Order[];
  onDelete: (id: string) => void;
  onSelect: (order: Order) => void;
  onCancel?: (id: string) => void | Promise<void>;
}

export function OrderTable({ orders, onDelete, onSelect, onCancel }: OrderTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

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
    await printShippingLabels(selectedOrders);
    setSelected(new Set());
  };

  const printLabel = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    await printShippingLabels([order]);
  };

  const downloadPdf = (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    downloadOrderPdf(order);
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
        <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-3">
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
            {orders.map((order) => (
              <TableRow key={order.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(order)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(order.id)}
                    onCheckedChange={() => toggleSelect(order.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm font-medium">{order.auftragsNr}</TableCell>
                <TableCell>{order.absenderName}</TableCell>
                <TableCell>{order.empfaengerName}</TableCell>
                <TableCell>{order.empfaengerStadt}</TableCell>
                <TableCell className="text-center">{order.pakete}</TableCell>
                <TableCell className="text-right">{order.gewicht} kg</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`${STATUS_COLORS[order.status]} border-0 text-xs`}>
                    {STATUS_LABELS[order.status]}
                  </Badge>
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
                      >
                        <FileDown className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
