import { useEffect, useMemo, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { getZoneBadgeStyle } from "@/lib/deliveryZones";

interface OrderDetailSheetProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdateOrder: (id: string, updates: Partial<Order>) => void;
  canUpdateStatus?: boolean;
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

function escapeHtml(value?: string) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateLabelHTML(order: Order, zone?: { label: string; color?: string | null } | null) {
  const zoneStyles = zone?.color
    ? `background:${zone.color}16;border-color:${zone.color}55;color:${zone.color};box-shadow: inset 0 0 0 1px ${zone.color}22;`
    : "background:hsl(140 12% 94%);border-color:hsl(145 15% 78%);color:hsl(160 30% 12%);box-shadow: inset 0 0 0 1px hsl(145 15% 88%);";

  return `
    <html>
    <head><title>Versandetikett – ${order.auftragsNr}</title>
    <style>
      @media print { body { margin: 0; } }
      :root {
        --bg: hsl(0 0% 100%);
        --fg: hsl(160 30% 10%);
        --muted: hsl(160 10% 42%);
        --line: hsl(145 15% 84%);
        --soft: hsl(140 12% 96%);
        --soft-strong: hsl(145 20% 92%);
        --primary: hsl(152 55% 33%);
      }
      body {
        font-family: Inter, 'Helvetica Neue', Arial, sans-serif;
        padding: 0;
        margin: 0;
        background: var(--bg);
        color: var(--fg);
      }
      .label {
        width: 100mm;
        height: 150mm;
        padding: 0;
        box-sizing: border-box;
        border: 1.2mm solid var(--fg);
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, hsl(140 18% 98%) 0%, hsl(0 0% 100%) 18%);
      }
      .accent-bar {
        height: 4mm;
        background: linear-gradient(90deg, var(--primary) 0%, hsl(160 42% 22%) 100%);
      }
      .content {
        padding: 5mm;
        display: flex;
        flex-direction: column;
        gap: 3.2mm;
        height: calc(100% - 4mm);
        box-sizing: border-box;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 4mm;
      }
      .brand-block {
        display: flex;
        flex-direction: column;
        gap: 1.2mm;
      }
      .brand-row {
        display: flex;
        align-items: center;
        gap: 2mm;
      }
      .logo-mark {
        width: 7mm;
        height: 7mm;
        border-radius: 2.5mm;
        background: linear-gradient(180deg, var(--primary) 0%, hsl(160 42% 24%) 100%);
      }
      .logo {
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 0.4px;
        line-height: 1;
      }
      .brand-subline {
        font-size: 8.5px;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        color: var(--muted);
      }
      .header-meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2mm;
      }
      .zone-badge {
        min-width: 24mm;
        padding: 2.2mm 3.2mm;
        border: 0.5mm solid var(--line);
        border-radius: 999px;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.8px;
        text-align: center;
      }
      .order-pill {
        background: var(--soft);
        border: 0.4mm solid var(--line);
        border-radius: 999px;
        padding: 1.4mm 3mm;
      }
      .order-nr {
        font-size: 12px;
        font-weight: 700;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: 0.4px;
      }
      .hero {
        border: 0.45mm solid var(--line);
        border-radius: 5mm;
        padding: 4mm;
        background: linear-gradient(180deg, hsl(140 25% 97%) 0%, hsl(0 0% 100%) 100%);
      }
      .hero-label {
        font-size: 8.2px;
        text-transform: uppercase;
        letter-spacing: 1.1px;
        color: var(--muted);
        margin-bottom: 1.2mm;
      }
      .recipient {
        font-size: 18px;
        font-weight: 800;
        line-height: 1.15;
        margin-bottom: 1.8mm;
      }
      .recipient-address {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
      }
      .phone {
        margin-top: 2mm;
        font-size: 10px;
        color: var(--muted);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2.6mm;
      }
      .section {
        border: 0.4mm solid var(--line);
        border-radius: 4mm;
        padding: 3mm;
        background: var(--bg);
      }
      .section-title {
        font-size: 8px;
        text-transform: uppercase;
        letter-spacing: 1.1px;
        color: var(--muted);
        margin-bottom: 1.2mm;
      }
      .section-content {
        font-size: 12.5px;
        font-weight: 600;
        line-height: 1.45;
        word-break: break-word;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2.4mm;
      }
      .meta-item {
        text-align: center;
        border: 0.4mm solid var(--line);
        border-radius: 4mm;
        padding: 3mm 2mm;
        background: var(--soft);
      }
      .meta-value {
        font-size: 17px;
        font-weight: 800;
        line-height: 1.1;
      }
      .barcode-card {
        border: 0.5mm solid var(--fg);
        border-radius: 4.5mm;
        padding: 3.2mm;
        background: repeating-linear-gradient(
          90deg,
          hsl(0 0% 100%) 0,
          hsl(0 0% 100%) 2.2mm,
          hsl(140 15% 97%) 2.2mm,
          hsl(140 15% 97%) 2.6mm
        );
      }
      .barcode-label {
        font-size: 7.6px;
        text-transform: uppercase;
        letter-spacing: 1.3px;
        color: var(--muted);
        margin-bottom: 1.4mm;
        text-align: center;
      }
      .barcode {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 21px;
        letter-spacing: 3.8px;
        text-align: center;
        font-weight: 700;
      }
      .notes {
        min-height: 15mm;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 3mm;
        margin-top: auto;
        padding-top: 2mm;
        border-top: 0.35mm dashed var(--line);
        font-size: 8.2px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
    </style></head>
    <body>
      <div class="label">
        <div class="accent-bar"></div>
        <div class="content">
          <div class="header">
            <div class="brand-block">
              <div class="brand-row">
                <div class="logo-mark"></div>
                <div class="logo">e-cargo</div>
              </div>
              <div class="brand-subline">Lokalkurier · Versandetikett</div>
            </div>
            <div class="header-meta">
              ${zone?.label ? `<div class="zone-badge" style="${zoneStyles}">${escapeHtml(zone.label)}</div>` : ""}
              <div class="order-pill"><div class="order-nr">${escapeHtml(order.auftragsNr)}</div></div>
            </div>
          </div>
          <div class="hero">
            <div class="hero-label">Empfänger</div>
            <div class="recipient">${escapeHtml(order.empfaengerName)}</div>
            <div class="recipient-address">${escapeHtml(order.empfaengerAdresse)}<br/>${escapeHtml(order.empfaengerPlz ? order.empfaengerPlz + " " : "")}${escapeHtml(order.empfaengerStadt)}</div>
            ${order.empfaengerTelefon ? `<div class="phone">Tel. ${escapeHtml(order.empfaengerTelefon)}</div>` : ""}
          </div>
          <div class="grid">
            <div class="section">
              <div class="section-title">Absender</div>
              <div class="section-content">${escapeHtml(order.absenderName)}<br/>${escapeHtml(order.absenderAdresse)}</div>
            </div>
            <div class="section">
              <div class="section-title">Service</div>
              <div class="section-content">Direktzustellung<br/>lokales Liefergebiet</div>
            </div>
          </div>
          <div class="meta">
            <div class="meta-item"><div class="section-title">Pakete</div><div class="meta-value">${order.pakete}</div></div>
            <div class="meta-item"><div class="section-title">Gewicht</div><div class="meta-value">${order.gewicht} kg</div></div>
            <div class="meta-item"><div class="section-title">Datum</div><div class="meta-value">${escapeHtml(order.erstelltAm)}</div></div>
          </div>
          <div class="barcode-card">
            <div class="barcode-label">Sendungsnummer</div>
            <div class="barcode">${escapeHtml(order.auftragsNr.replace(/-/g, " "))}</div>
          </div>
          ${order.notizen ? `<div class="section notes"><div class="section-title">Hinweise</div><div class="section-content">${escapeHtml(order.notizen)}</div></div>` : ""}
          <div class="footer">
            <span>Bitte Zone bei der Sortierung beachten</span>
            <span>e-cargo</span>
          </div>
        </div>
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
  canUpdateStatus = false,
}: OrderDetailSheetProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Order>>({});
  const [zoneMeta, setZoneMeta] = useState<{ label: string; color?: string | null } | null>(null);
  const currentStep = order ? STATUS_ORDER[order.status] : 0;
  const canEdit = order ? isEditable(order.status) : false;
  const isCancelled = order?.status === "storniert";
  const zoneBadgeStyle = useMemo(() => getZoneBadgeStyle(zoneMeta?.color), [zoneMeta?.color]);

  useEffect(() => {
    const postcode = order?.empfaengerPlz?.trim();

    if (!postcode || !/^\d{5}$/.test(postcode)) {
      setZoneMeta(null);
      return;
    }

    let active = true;

    const loadZone = async () => {
      const { data, error } = await supabase
        .from("delivery_zone_postcodes")
        .select("delivery_zones(label, color)")
        .eq("postcode", postcode)
        .maybeSingle();

      if (!active) return;

      if (error || !data?.delivery_zones) {
        setZoneMeta(null);
        return;
      }

      const zone = Array.isArray(data.delivery_zones) ? data.delivery_zones[0] : data.delivery_zones;
      setZoneMeta(zone ? { label: zone.label, color: zone.color } : null);
    };

    loadZone();

    return () => {
      active = false;
    };
  }, [order?.empfaengerPlz]);

  if (!order) return null;

  const startEditing = () => {
    setForm({
      empfaengerName: order.empfaengerName,
      empfaengerAdresse: order.empfaengerAdresse,
      empfaengerPlz: order.empfaengerPlz,
      empfaengerStadt: order.empfaengerStadt,
      empfaengerEmail: order.empfaengerEmail,
      empfaengerTelefon: order.empfaengerTelefon,
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
      win.document.write(generateLabelHTML(order, zoneMeta));
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
            {zoneMeta?.label && !editing && (
              <Badge variant="outline" className="w-fit border-border font-semibold" style={zoneBadgeStyle}>
                Zone {zoneMeta.label}
              </Badge>
            )}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">PLZ</Label>
                    <Input
                      value={form.empfaengerPlz ?? ""}
                      onChange={(e) => update("empfaengerPlz", e.target.value)}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">E-Mail</Label>
                    <Input
                      type="email"
                      value={form.empfaengerEmail ?? ""}
                      onChange={(e) => update("empfaengerEmail", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefon</Label>
                    <Input
                      value={form.empfaengerTelefon ?? ""}
                      onChange={(e) => update("empfaengerTelefon", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium">{order.empfaengerName}</p>
                <p className="text-sm text-muted-foreground">
                  {order.empfaengerAdresse}{order.empfaengerAdresse ? ", " : ""}{order.empfaengerPlz ? order.empfaengerPlz + " " : ""}{order.empfaengerStadt}
                </p>
                {(order.empfaengerEmail || order.empfaengerTelefon) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {[order.empfaengerEmail, order.empfaengerTelefon].filter(Boolean).join(" · ")}
                  </p>
                )}
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

          {canUpdateStatus && !isCancelled && currentStep < 3 && (
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
