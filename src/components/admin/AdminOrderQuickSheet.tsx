import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrderDetailSheet } from "@/components/dashboard/OrderDetailSheet";
import { Order, OrderStatus } from "@/types/order";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { sendOrderStatusEmail } from "@/lib/orderEmail";
import { toast } from "sonner";

type HistoryEntry = { id: string; status: OrderStatus; reason?: string; createdAt: string };

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
});

interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after successful status/data change so parent lists can refresh. */
  onChanged?: () => void;
}

/**
 * Self-contained admin order detail sheet: takes only an orderId, loads the
 * full order + status history from the DB, and wires update/status callbacks
 * just like the admin dashboard. Used in places like the route planning page
 * where rows do not carry the full Order shape.
 */
export function AdminOrderQuickSheet({ orderId, open, onOpenChange, onChanged }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [orderRes, historyRes] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, user_id, auftrags_nr, absender_name, absender_adresse, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_email, empfaenger_telefon, pakete, gewicht, package_length_cm, package_width_cm, package_height_cm, status, notizen, created_at, delivery_attempts, is_pickup, dhl_label_url, dhl_tracking_number, delivery_unconfirmed",
          )
          .eq("id", orderId)
          .maybeSingle(),
        supabase
          .from("order_status_history")
          .select("id, status, reason, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      const o = orderRes.data as any;
      if (o) {
        setUserId(o.user_id ?? null);
        setOrder({
          id: o.id,
          auftragsNr: o.auftrags_nr,
          absenderName: o.absender_name,
          absenderAdresse: o.absender_adresse ?? "",
          empfaengerName: o.empfaenger_name,
          empfaengerAdresse: o.empfaenger_adresse ?? "",
          empfaengerPlz: o.empfaenger_plz ?? "",
          empfaengerStadt: o.empfaenger_stadt,
          empfaengerEmail: o.empfaenger_email ?? undefined,
          empfaengerTelefon: o.empfaenger_telefon ?? undefined,
          pakete: o.pakete,
          gewicht: Number(o.gewicht),
          packageLengthCm: o.package_length_cm == null ? undefined : Number(o.package_length_cm),
          packageWidthCm: o.package_width_cm == null ? undefined : Number(o.package_width_cm),
          packageHeightCm: o.package_height_cm == null ? undefined : Number(o.package_height_cm),
          status: o.status,
          erstelltAm: new Date(o.created_at).toLocaleDateString("de-DE"),
          notizen: o.notizen ?? undefined,
          deliveryAttempts: o.delivery_attempts ?? undefined,
          isPickup: o.is_pickup ?? undefined,
          dhlLabelUrl: o.dhl_label_url ?? undefined,
          dhlTrackingNumber: o.dhl_tracking_number ?? undefined,
          deliveryUnconfirmed: o.delivery_unconfirmed ?? undefined,
        });
      } else {
        setUserId(null);
        setOrder(null);
      }
      setHistory(
        ((historyRes.data as any[]) ?? []).map((e) => ({
          id: e.id,
          status: e.status,
          reason: e.reason ?? undefined,
          createdAt: dateTimeFormatter.format(new Date(e.created_at)),
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, open]);

  const handleUpdateStatus = async (id: string, status: OrderStatus, reason?: string) => {
    const { error } = await supabase.rpc("admin_update_order_status", {
      _order_id: id,
      _status: status,
      _reason: reason ?? null,
    });
    if (error) {
      toast.error(error.message ?? "Status konnte nicht geändert werden");
      return;
    }
    if (order) {
      void sendOrderStatusEmail({
        orderId: order.id,
        auftragsNr: order.auftragsNr,
        status,
        empfaengerName: order.empfaengerName,
        empfaengerEmail: order.empfaengerEmail,
        empfaengerAdresse: order.empfaengerAdresse,
        empfaengerPlz: order.empfaengerPlz,
        empfaengerStadt: order.empfaengerStadt,
        haendlerUserId: userId ?? undefined,
        reason,
      });
    }
    setOrder((prev) => (prev ? { ...prev, status } : prev));
    const { data: refreshed } = await supabase
      .from("order_status_history")
      .select("id, status, reason, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    setHistory(
      ((refreshed as any[]) ?? []).map((e) => ({
        id: e.id,
        status: e.status,
        reason: e.reason ?? undefined,
        createdAt: dateTimeFormatter.format(new Date(e.created_at)),
      })),
    );
    onChanged?.();
  };

  const handleUpdateOrder = async (id: string, updates: Partial<Order>) => {
    const dbUpdates: TablesUpdate<"orders"> = {};
    if (updates.empfaengerName !== undefined) dbUpdates.empfaenger_name = updates.empfaengerName;
    if (updates.empfaengerAdresse !== undefined) dbUpdates.empfaenger_adresse = updates.empfaengerAdresse;
    if (updates.empfaengerPlz !== undefined) dbUpdates.empfaenger_plz = updates.empfaengerPlz;
    if (updates.empfaengerStadt !== undefined) dbUpdates.empfaenger_stadt = updates.empfaengerStadt;
    if (updates.empfaengerEmail !== undefined) dbUpdates.empfaenger_email = updates.empfaengerEmail || null;
    if (updates.empfaengerTelefon !== undefined) dbUpdates.empfaenger_telefon = updates.empfaengerTelefon || null;
    if (updates.pakete !== undefined) dbUpdates.pakete = updates.pakete;
    if (updates.gewicht !== undefined) dbUpdates.gewicht = updates.gewicht;
    if (updates.packageLengthCm !== undefined) dbUpdates.package_length_cm = updates.packageLengthCm ?? null;
    if (updates.packageWidthCm !== undefined) dbUpdates.package_width_cm = updates.packageWidthCm ?? null;
    if (updates.packageHeightCm !== undefined) dbUpdates.package_height_cm = updates.packageHeightCm ?? null;
    if (updates.notizen !== undefined) dbUpdates.notizen = updates.notizen || null;

    const { error } = await supabase.from("orders").update(dbUpdates).eq("id", id);
    if (error) {
      toast.error(error.message ?? "Auftrag konnte nicht gespeichert werden");
      return;
    }
    setOrder((prev) => (prev ? { ...prev, ...updates } : prev));
    toast.success("Auftrag aktualisiert");
    onChanged?.();
  };

  return (
    <OrderDetailSheet
      order={order}
      open={open && !loading}
      onOpenChange={onOpenChange}
      onUpdateStatus={handleUpdateStatus}
      onUpdateOrder={handleUpdateOrder}
      canUpdateStatus
      statusHistory={history}
    />
  );
}