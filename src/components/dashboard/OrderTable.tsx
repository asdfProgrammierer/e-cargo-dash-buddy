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
import { Printer, Trash2 } from "lucide-react";
import { Order, STATUS_LABELS, STATUS_COLORS } from "@/types/order";

interface OrderTableProps {
  orders: Order[];
  onDelete: (id: string) => void;
  onSelect: (order: Order) => void;
}

function generateLabelHTML(order: Order) {
  return `
    <html>
    <head><title>Versandetikett – ${order.auftragsNr}</title>
    <style>
      @media print { body { margin: 0; } }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 0; margin: 0; }
      .label { width: 100mm; height: 150mm; padding: 6mm; box-sizing: border-box; border: 2px solid #000; display: flex; flex-direction: column; gap: 3mm; page-break-after: always; }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 3mm; }
      .logo { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
      .order-nr { font-size: 13px; font-weight: 600; font-family: monospace; }
      .section { margin: 2mm 0; }
      .section-title { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 1mm; }
      .section-content { font-size: 13px; font-weight: 500; line-height: 1.4; }
      .recipient { font-size: 16px; font-weight: 700; }
      .barcode { font-family: monospace; font-size: 20px; letter-spacing: 4px; text-align: center; padding: 4mm 0; border-top: 2px solid #000; border-bottom: 2px solid #000; margin: 2mm 0; }
      .meta { display: flex; justify-content: space-between; font-size: 11px; }
      .meta-item { text-align: center; }
      .meta-value { font-size: 18px; font-weight: 700; }
    </style></head>
    <body>
      <div class="label">
        <div class="header">
          <div class="logo">eCargo</div>
          <div class="order-nr">${order.auftragsNr}</div>
        </div>
        <div class="section">
          <div class="section-title">Absender</div>
          <div class="section-content">${order.absenderName}<br/>${order.absenderAdresse}</div>
        </div>
        <div class="section">
          <div class="section-title">Empfänger</div>
          <div class="recipient">${order.empfaengerName}</div>
          <div class="section-content">${order.empfaengerAdresse}<br/>${order.empfaengerPlz ? order.empfaengerPlz + " " : ""}${order.empfaengerStadt}</div>
          ${order.empfaengerTelefon ? `<div class="section-content" style="font-size:11px;color:#666">Tel: ${order.empfaengerTelefon}</div>` : ""}
        </div>
        <div class="barcode">${order.auftragsNr.replace(/-/g, " ")}</div>
        <div class="meta">
          <div class="meta-item"><div class="section-title">Pakete</div><div class="meta-value">${order.pakete}</div></div>
          <div class="meta-item"><div class="section-title">Gewicht</div><div class="meta-value">${order.gewicht} kg</div></div>
          <div class="meta-item"><div class="section-title">Datum</div><div class="meta-value">${order.erstelltAm}</div></div>
        </div>
        ${order.notizen ? `<div class="section"><div class="section-title">Hinweise</div><div class="section-content">${order.notizen}</div></div>` : ""}
      </div>
    </body></html>
  `;
}

export function OrderTable({ orders, onDelete, onSelect }: OrderTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const printBulkLabels = () => {
    const selectedOrders = orders.filter((o) => selected.has(o.id));
    if (selectedOrders.length === 0) return;
    const html = selectedOrders.map(generateLabelHTML).join("");
    const wrappedHtml = `<html><head><title>Etiketten (${selectedOrders.length})</title>
      <style>@media print { .label { page-break-after: always; } }</style></head>
      <body>${html}</body></html>`;
    const win = window.open("", "_blank", "width=420,height=640");
    if (win) {
      win.document.write(wrappedHtml);
      win.document.close();
      setTimeout(() => win.print(), 300);
    }
    setSelected(new Set());
  };

  const printLabel = (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    const win = window.open("", "_blank", "width=420,height=640");
    if (win) {
      win.document.write(generateLabelHTML(order));
      win.document.close();
      setTimeout(() => win.print(), 300);
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Löschen"
                      onClick={() => onDelete(order.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
