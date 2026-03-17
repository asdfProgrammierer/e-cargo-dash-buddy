import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  Pencil,
  Printer,
  Save,
  X,
} from "lucide-react";
import { Order, OrderStatus, STATUS_LABELS, STATUS_COLORS } from "@/types/order";

interface OrderDetailSheetProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdateOrder: (id: string, updates: Partial<Order>) => void;
}

const TIMELINE_STEPS: { status: OrderStatus; label: string; icon: React.ElementType }[] = [
  { status: "neu", label: "Neu", icon: Clock },
  { status: "in_bearbeitung", label: "In Bearbeitung", icon: Package },
  { status: "unterwegs", label: "Unterwegs", icon: Truck },
  { status: "zugestellt", label: "Zugestellt", icon: CheckCircle2 },
];

const STATUS_ORDER: Record<OrderStatus, number> = {
  neu: 0,
  in_bearbeitung: 1,
  unterwegs: 2,
  zugestellt: 3,
  storniert: -1,
};

function isEditable(status: OrderStatus) {
  return status === "neu" || status === "in_bearbeitung";
}

function generateLabelHTML(order: Order) {
  return `
    <html>
    <head><title>Versandetikett – ${order.auftragsNr}</title>
    <style>
      @media print { body { margin: 0; } }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 0; margin: 0; }
      .label { width: 100mm; height: 150mm; padding: 6mm; box-sizing: border-box; border: 2px solid #000; display: flex; flex-direction: column; gap: 3mm; }
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

export function OrderDetailSheet({
  order,
  open,
  onOpenChange,
  onUpdateStatus,
  onUpdateOrder,
}: OrderDetailSheetProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Order>>({});

  if (!order) return null;

  const currentStep = STATUS_ORDER[order.status];
  const canEdit = isEditable(order.status);
  const isCancelled = order.status === "storniert";

  const startEditing = () => {
    setForm({
      empfaengerName: order.empfaengerName,
      empfaengerAdresse: order.empfaengerAdresse,
      empfaengerStadt: order.empfaengerStadt,
      pakete: order.pakete,
      gewicht: order.gewicht,
      notizen: order.notizen,
    });
    setEditing(true);
  };

  const saveEdits = () => {
    onUpdateOrder(order.id, form);
    setEditing(false);
  };

  const cancelEdits = () => {
    setEditing(false);
    setForm({});
  };

  const printLabel = () => {
    const win = window.open("", "_blank", "width=420,height=640");
    if (win) {
      win.document.write(generateLabelHTML(order));
      win.document.close();
      setTimeout(() => win.print(), 300);
    }
  };

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-3">
              <span className="font-mono text-base">{order.auftragsNr}</span>
              <Badge variant="secondary" className={`${STATUS_COLORS[order.status]} border-0 text-xs`}>
                {STATUS_LABELS[order.status]}
              </Badge>
            </SheetTitle>
          </div>
          <p className="text-sm text-muted-foreground">Erstellt am {order.erstelltAm}</p>
        </SheetHeader>

        {/* Status Timeline */}
        <div className="py-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Sendungsverlauf
          </h3>
          {isCancelled ? (
            <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-4">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="font-medium text-destructive">Auftrag storniert</span>
            </div>
          ) : (
            <div className="relative">
              {TIMELINE_STEPS.map((step, i) => {
                const isActive = currentStep >= i;
                const isCurrent = currentStep === i;
                const Icon = step.icon;
                return (
                  <div key={step.status} className="flex items-start gap-3 relative">
                    {/* Connector line */}
                    {i < TIMELINE_STEPS.length - 1 && (
                      <div
                        className={`absolute left-[15px] top-[32px] w-0.5 h-[calc(100%-8px)] ${
                          currentStep > i ? "bg-primary" : "bg-border"
                        }`}
                      />
                    )}
                    <div
                      className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isCurrent
                          ? "border-primary bg-primary text-primary-foreground"
                          : isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className={`pb-6 ${isActive ? "" : "opacity-40"}`}>
                      <p className={`text-sm font-medium ${isCurrent ? "text-primary" : ""}`}>
                        {step.label}
                      </p>
                      {isCurrent && (
                        <p className="text-xs text-muted-foreground mt-0.5">Aktueller Status</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator />

        {/* Order Details */}
        <div className="py-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Auftragsdetails
            </h3>
            {canEdit && !editing && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Bearbeiten
              </Button>
            )}
            {editing && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelEdits}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Abbrechen
                </Button>
                <Button size="sm" onClick={saveEdits}>
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Speichern
                </Button>
              </div>
            )}
          </div>

          {/* Sender */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Absender</p>
            <p className="font-medium">{order.absenderName}</p>
            <p className="text-sm text-muted-foreground">{order.absenderAdresse}</p>
          </div>

          {/* Recipient */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Empfänger</p>
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={form.empfaengerName ?? ""}
                    onChange={(e) => update("empfaengerName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Adresse</Label>
                  <Input
                    value={form.empfaengerAdresse ?? ""}
                    onChange={(e) => update("empfaengerAdresse", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stadt</Label>
                  <Input
                    value={form.empfaengerStadt ?? ""}
                    onChange={(e) => update("empfaengerStadt", e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium">{order.empfaengerName}</p>
                <p className="text-sm text-muted-foreground">
                  {order.empfaengerAdresse}, {order.empfaengerStadt}
                </p>
              </>
            )}
          </div>

          {/* Package info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pakete</p>
              {editing ? (
                <Input
                  type="number"
                  min={1}
                  className="mt-1.5"
                  value={form.pakete ?? 1}
                  onChange={(e) => update("pakete", parseInt(e.target.value) || 1)}
                />
              ) : (
                <p className="text-2xl font-bold mt-1">{order.pakete}</p>
              )}
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gewicht</p>
              {editing ? (
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  className="mt-1.5"
                  value={form.gewicht ?? 0}
                  onChange={(e) => update("gewicht", parseFloat(e.target.value) || 0)}
                />
              ) : (
                <p className="text-2xl font-bold mt-1">{order.gewicht} kg</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Notizen</p>
            {editing ? (
              <Textarea
                value={form.notizen ?? ""}
                onChange={(e) => update("notizen", e.target.value)}
                rows={3}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {order.notizen || "Keine Notizen vorhanden"}
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="py-4 space-y-3">
          <Button variant="outline" className="w-full" onClick={printLabel}>
            <Printer className="mr-2 h-4 w-4" />
            Versandetikett drucken
          </Button>

          {!isCancelled && currentStep < 3 && (
            <Button
              className="w-full"
              onClick={() => {
                const nextStatus = TIMELINE_STEPS[currentStep + 1]?.status;
                if (nextStatus) onUpdateStatus(order.id, nextStatus);
              }}
            >
              → {STATUS_LABELS[TIMELINE_STEPS[currentStep + 1]?.status]}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
