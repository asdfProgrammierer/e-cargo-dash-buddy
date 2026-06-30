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
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";
import { Order, OrderStatus, STATUS_LABELS, STATUS_COLORS, MAX_DELIVERY_ATTEMPTS } from "@/types/order";
import { getZoneBadgeStyle } from "@/lib/deliveryZones";
import { getOrderZoneMeta, printShippingLabels } from "@/lib/shippingLabels";
import { downloadOrderPdf } from "@/lib/orderPdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_OPTIONS: OrderStatus[] = ["neu", "in_bearbeitung", "unterwegs", "zugestellt", "nicht_zugestellt", "storniert"];

interface OrderDetailSheetProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: string, status: OrderStatus, reason?: string) => void | Promise<void>;
  onUpdateOrder: (id: string, updates: Partial<Order>) => void;
  canUpdateStatus?: boolean;
  statusHistory?: { id: string; status: OrderStatus; reason?: string; createdAt: string }[];
  onDeleted?: (id: string) => void;
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
  nicht_zugestellt: -1,
  storniert: -1,
};

function isEditable(status: OrderStatus) {
  return status === "neu";
}

export function OrderDetailSheet({
  order,
  open,
  onOpenChange,
  onUpdateStatus,
  onUpdateOrder,
  canUpdateStatus = false,
  statusHistory,
  onDeleted,
}: OrderDetailSheetProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Order>>({});
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const [zoneMeta, setZoneMeta] = useState<{ label: string; color?: string | null } | null>(null);
  const [dhlLoading, setDhlLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [resolvingAction, setResolvingAction] = useState<"retry" | "final" | null>(null);
  const [fallbackDates, setFallbackDates] = useState<{ created?: string; delivered?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!order?.id || !open) {
      setFallbackDates({});
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("created_at, delivered_at")
        .eq("id", order.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setFallbackDates({
        created: data.created_at ?? undefined,
        delivered: data.delivered_at ?? undefined,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.id, open]);

  const statusDates = useMemo(() => {
    const map: Record<string, string> = {};
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    if (statusHistory?.length) {
      for (let i = statusHistory.length - 1; i >= 0; i--) {
        const entry = statusHistory[i];
        if (!map[entry.status]) {
          map[entry.status] = fmt(entry.createdAt);
        }
      }
    }
    // Fallbacks für ältere Aufträge ohne vollständige Status-Historie
    if (!map.neu && fallbackDates.created) {
      map.neu = fmt(fallbackDates.created);
    }
    if (!map.zugestellt && fallbackDates.delivered) {
      map.zugestellt = fmt(fallbackDates.delivered);
    }
    return map;
  }, [statusHistory, fallbackDates]);

  const currentStep = order ? STATUS_ORDER[order.status] : 0;
  const isAdminView = canUpdateStatus;
  const canEdit = order
    ? isAdminView
      ? order.status !== "zugestellt"
      : isEditable(order.status)
    : false;
  const isCancelled = order?.status === "storniert";
  const isUndelivered = order?.status === "nicht_zugestellt";
  const isMerchantView = !canUpdateStatus;
  const canMerchantCancel =
    isMerchantView && order && (order.status === "neu" || order.status === "in_bearbeitung");
  const canMerchantReactivate = isMerchantView && isCancelled;
  const zoneBadgeStyle = useMemo(() => getZoneBadgeStyle(zoneMeta?.color), [zoneMeta?.color]);

  useEffect(() => {
    if (!open) {
      setPendingStatus(null);
      setStatusReason("");
      setConfirmCancel(false);
      setConfirmReactivate(false);
      setConfirmDelete(0);
    }
  }, [open]);

  useEffect(() => {
    const postcode = order?.empfaengerPlz?.trim();

    if (!postcode || !/^\d{5}$/.test(postcode)) {
      setZoneMeta(null);
      return;
    }

    let active = true;

    const loadZone = async () => {
      const zone = await getOrderZoneMeta(order);

      if (!active) return;
      setZoneMeta(zone ? { label: zone.label } : null);
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
        packageLengthCm: order.packageLengthCm,
        packageWidthCm: order.packageWidthCm,
        packageHeightCm: order.packageHeightCm,
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

  const printLabel = async () => {
    await printShippingLabels([order]);
  };

  const downloadPdf = async () => {
    if (!order || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadOrderPdf(order);
    } catch (err) {
      console.error("PDF-Erstellung fehlgeschlagen", err);
      toast.error("PDF konnte nicht erstellt werden. Bitte erneut versuchen.");
    } finally {
      setPdfLoading(false);
    }
  };

  const createDhlLabel = async () => {
    if (!order) return;
    setDhlLoading(true);
    const { data, error } = await supabase.functions.invoke("create-dhl-label", {
      body: { orderId: order.id },
    });
    setDhlLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || "DHL-Label konnte nicht erstellt werden");
    } else {
      toast.success("DHL-Label erstellt");
    }
  };

  const requestStatusUpdate = async (status: OrderStatus) => {
    if (status === "nicht_zugestellt") {
      setPendingStatus(status);
      return;
    }

    setPendingStatus(null);
    setStatusReason("");
    await onUpdateStatus(order.id, status);
  };

  const confirmUndelivered = async () => {
    const trimmedReason = statusReason.trim();
    if (!trimmedReason) return;

    await onUpdateStatus(order.id, "nicht_zugestellt", trimmedReason);
    setPendingStatus(null);
    setStatusReason("");
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
              {order.dhlTrackingNumber ? (
                <Badge variant="secondary" className="border-0 text-xs bg-yellow-400 text-yellow-950 hover:bg-yellow-400">
                  DHL
                </Badge>
              ) : (
                <Badge variant="secondary" className={`${STATUS_COLORS[order.status]} border-0 text-xs`}>
                  {STATUS_LABELS[order.status]}
                </Badge>
              )}
              {(order.deliveryAttempts ?? 0) > 0 ? (
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning text-xs">
                  Versuch {order.deliveryAttempts} von {MAX_DELIVERY_ATTEMPTS}
                </Badge>
              ) : null}
            </SheetTitle>
          </div>
          <p className="text-sm text-muted-foreground">Erstellt am {order.erstelltAm}</p>
        </SheetHeader>

        {canUpdateStatus && order.deliveryUnconfirmed && (
          <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <div className="flex-1">
                <p className="text-sm font-medium text-warning">Bestätigung ausstehend</p>
                <p className="text-xs text-muted-foreground">
                  Der Fahrer hat diesen Auftrag als „Nicht zugestellt" markiert. Bitte
                  entscheiden:
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={resolvingAction !== null}
                onClick={async () => {
                  setResolvingAction("retry");
                  const { error } = await supabase.rpc("admin_resolve_undelivered_order", {
                    _order_id: order.id,
                    _action: "retry",
                  });
                  setResolvingAction(null);
                  if (error) {
                    toast.error(error.message || "Aktion fehlgeschlagen");
                    return;
                  }
                  toast.success("Auftrag wieder zur Zustellung freigegeben");
                  onOpenChange(false);
                }}
              >
                {resolvingAction === "retry" ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1 h-3 w-3" />
                )}
                Erneut zustellen
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={resolvingAction !== null}
                onClick={async () => {
                  setResolvingAction("final");
                  const { error } = await supabase.rpc("admin_resolve_undelivered_order", {
                    _order_id: order.id,
                    _action: "final",
                  });
                  setResolvingAction(null);
                  if (error) {
                    toast.error(error.message || "Aktion fehlgeschlagen");
                    return;
                  }
                  toast.success("Auftrag als endgültig nicht zugestellt bestätigt");
                  onOpenChange(false);
                }}
              >
                {resolvingAction === "final" ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <XCircle className="mr-1 h-3 w-3" />
                )}
                Endgültig nicht zugestellt
              </Button>
            </div>
          </div>
        )}

        {/* Status Timeline */}
        <div className="py-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Sendungsverlauf
          </h3>
          {order.dhlTrackingNumber ? (
            <a
              href={`https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(order.dhlTrackingNumber)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-lg bg-yellow-400/15 border border-yellow-400/40 p-4 hover:bg-yellow-400/25 transition-colors"
            >
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">DHL Sendungsverfolgung</span>
                <span className="font-mono text-sm font-medium">{order.dhlTrackingNumber}</span>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          ) : isCancelled ? (
            <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-4">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="font-medium text-destructive">Auftrag storniert</span>
            </div>
          ) : isUndelivered ? (
            <div className="flex items-center gap-3 rounded-lg bg-warning/10 p-4">
              <XCircle className="h-5 w-5 text-warning" />
              <span className="font-medium text-warning">Zustellung fehlgeschlagen</span>
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
                      {isActive && statusDates[step.status] && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {statusDates[step.status]}
                        </p>
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

          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paketmaße</p>
            {editing ? (
              <div className="mt-1.5 grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Länge</Label>
                  <Input type="number" min={0} step={0.1} value={form.packageLengthCm ?? 0} onChange={(e) => update("packageLengthCm", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Breite</Label>
                  <Input type="number" min={0} step={0.1} value={form.packageWidthCm ?? 0} onChange={(e) => update("packageWidthCm", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Höhe</Label>
                  <Input type="number" min={0} step={0.1} value={form.packageHeightCm ?? 0} onChange={(e) => update("packageHeightCm", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            ) : (
              <p className="text-lg font-bold mt-1">
                {order.packageLengthCm || order.packageWidthCm || order.packageHeightCm
                  ? `${order.packageLengthCm || 0} × ${order.packageWidthCm || 0} × ${order.packageHeightCm || 0} cm`
                  : "Keine Maße hinterlegt"}
              </p>
            )}
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

        {!!statusHistory?.length && (
          <>
            <div className="py-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Auftragshistorie
              </h3>
              <div className="space-y-3">
                {statusHistory.map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-muted/50 p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className={`${STATUS_COLORS[entry.status]} border-0 text-xs`}>
                        {STATUS_LABELS[entry.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{entry.createdAt}</span>
                    </div>
                    {entry.reason && <p className="text-sm text-foreground">{entry.reason}</p>}
                  </div>
                ))}
              </div>
            </div>

            <Separator />
          </>
        )}

        {/* Actions */}
        <div className="py-4 space-y-3">
          <Button variant="outline" className="w-full" onClick={printLabel}>
            <Printer className="mr-2 h-4 w-4" />
            Versandetikett drucken
          </Button>

          <Button variant="outline" className="w-full" onClick={downloadPdf} disabled={pdfLoading}>
            <Printer className="mr-2 h-4 w-4" />
            {pdfLoading ? "Auftrags-PDF wird erstellt…" : "Auftrags-PDF herunterladen"}
          </Button>

          {order.dhlLabelUrl ? (
            <a href={order.dhlLabelUrl} target="_blank" rel="noopener noreferrer" className="block">
              <Button variant="outline" className="w-full">
                <Printer className="mr-2 h-4 w-4" />
                DHL-Label öffnen ({order.dhlTrackingNumber})
              </Button>
            </a>
          ) : (
            /^\d{5}$/.test(order.empfaengerPlz?.trim() ?? "") && !zoneMeta && (
              <Button variant="outline" className="w-full" onClick={createDhlLabel} disabled={dhlLoading}>
                <Package className="mr-2 h-4 w-4" />
                {dhlLoading ? "DHL-Label wird erstellt..." : "DHL-Label erzeugen"}
              </Button>
            )
          )}

          {canUpdateStatus && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status ändern</p>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    variant={order.status === status ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => requestStatusUpdate(status)}
                    disabled={order.status === status}
                  >
                    {STATUS_LABELS[status]}
                  </Button>
                ))}
              </div>

              {pendingStatus === "nicht_zugestellt" && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Grund für nicht erfolgreiche Zustellung</Label>
                    <Textarea
                      value={statusReason}
                      onChange={(e) => setStatusReason(e.target.value)}
                      rows={3}
                      placeholder="z. B. Kunde nicht angetroffen oder Adresse unklar"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setPendingStatus(null)}>
                      Abbrechen
                    </Button>
                    <Button type="button" size="sm" onClick={confirmUndelivered} disabled={!statusReason.trim()}>
                      Historie speichern
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {canUpdateStatus && !isCancelled && !isUndelivered && currentStep < 3 && (
            <Button
              className="w-full"
              onClick={() => {
                const nextStatus = TIMELINE_STEPS[currentStep + 1]?.status;
                if (nextStatus) requestStatusUpdate(nextStatus);
              }}
            >
              → {STATUS_LABELS[TIMELINE_STEPS[currentStep + 1]?.status]}
            </Button>
          )}

          {canMerchantCancel && (
            confirmCancel ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Auftrag wirklich stornieren?
                </p>
                <p className="text-xs text-muted-foreground">
                  Sie können den Auftrag anschließend wieder bearbeiten und neu einreichen.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmCancel(false)}>
                    Abbrechen
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      await onUpdateStatus(order.id, "storniert");
                      setConfirmCancel(false);
                    }}
                  >
                    Stornieren
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setConfirmCancel(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Auftrag stornieren
              </Button>
            )
          )}

          {canMerchantReactivate && (
            confirmReactivate ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Stornierten Auftrag bearbeiten?
                </p>
                <p className="text-xs text-muted-foreground">
                  Der Auftrag wird auf „Neu" zurückgesetzt und kann erneut bearbeitet werden.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReactivate(false)}>
                    Abbrechen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      await onUpdateStatus(order.id, "neu");
                      setConfirmReactivate(false);
                    }}
                  >
                    Auftrag bearbeiten
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setConfirmReactivate(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Auftrag bearbeiten
              </Button>
            )
          )}

          {canUpdateStatus && (
            confirmDelete > 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm font-medium text-destructive">
                  {confirmDelete === 1
                    ? "Auftrag wirklich löschen?"
                    : "Wirklich unwiderruflich löschen?"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {confirmDelete === 1
                    ? "Der Auftrag wird aus der Datenbank entfernt."
                    : "Diese Aktion kann nicht rückgängig gemacht werden. Sendungsverlauf und Stopps werden ebenfalls gelöscht."}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(0)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deleting}
                    onClick={async () => {
                      if (confirmDelete === 1) {
                        setConfirmDelete(2);
                        return;
                      }
                      setDeleting(true);
                      const { error } = await supabase.from("orders").delete().eq("id", order.id);
                      setDeleting(false);
                      if (error) {
                        toast.error(error.message || "Auftrag konnte nicht gelöscht werden");
                        return;
                      }
                      toast.success("Auftrag gelöscht");
                      setConfirmDelete(0);
                      onOpenChange(false);
                      onDeleted?.(order.id);
                    }}
                  >
                    {deleting ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    {confirmDelete === 1 ? "Weiter" : "Endgültig löschen"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(1)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Auftrag löschen
              </Button>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
