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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Order, OrderStatus, STATUS_LABELS, STATUS_COLORS } from "@/types/order";

interface OrderTableProps {
  orders: Order[];
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onDelete: (id: string) => void;
}

const ALL_STATUSES: OrderStatus[] = ["neu", "in_bearbeitung", "unterwegs", "zugestellt", "storniert"];

export function OrderTable({ orders, onUpdateStatus, onDelete }: OrderTableProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
        <p className="text-muted-foreground">Keine Aufträge gefunden</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="font-semibold">Auftrags-Nr.</TableHead>
            <TableHead className="font-semibold">Absender</TableHead>
            <TableHead className="font-semibold">Empfänger</TableHead>
            <TableHead className="font-semibold">Stadt</TableHead>
            <TableHead className="font-semibold text-center">Pakete</TableHead>
            <TableHead className="font-semibold text-right">Gewicht</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Datum</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="hover:bg-muted/30">
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
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {ALL_STATUSES.filter((s) => s !== order.status).map((status) => (
                      <DropdownMenuItem key={status} onClick={() => onUpdateStatus(order.id, status)}>
                        → {STATUS_LABELS[status]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(order.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Löschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
