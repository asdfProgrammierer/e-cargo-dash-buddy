import { useState, useEffect, useCallback } from "react";
import { Order, OrderStatus } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { sendOrderStatusEmail } from "@/lib/orderEmail";

async function geocodeOrder(order: Order) {
  if (!order.empfaengerStadt) return;
  try {
    const { data, error } = await supabase.functions.invoke("geocode-address", {
      body: {
        strasse: order.empfaengerAdresse ?? "",
        plz: order.empfaengerPlz ?? "",
        stadt: order.empfaengerStadt,
      },
    });
    if (error || !data || data.error) return;
    await supabase
      .from("orders")
      .update({ lat: data.lat, lng: data.lng, geocoded_at: new Date().toISOString() })
      .eq("id", order.id);
  } catch (err) {
    console.warn("Geocoding failed for order", order.id, err);
  }
}

interface DbOrder {
  id: string;
  user_id: string;
  auftrags_nr: string;
  absender_name: string;
  absender_adresse: string;
  empfaenger_name: string;
  empfaenger_adresse: string;
  empfaenger_plz: string;
  empfaenger_stadt: string;
  empfaenger_email: string | null;
  empfaenger_telefon: string | null;
  pakete: number;
  gewicht: number;
  package_length_cm: number | null;
  package_width_cm: number | null;
  package_height_cm: number | null;
  status: string;
  notizen: string | null;
  created_at: string;
  updated_at: string;
  delivery_attempts?: number | null;
  is_pickup?: boolean | null;
}

function dbToOrder(row: DbOrder): Order {
  return {
    id: row.id,
    auftragsNr: row.auftrags_nr,
    absenderName: row.absender_name,
    absenderAdresse: row.absender_adresse,
    empfaengerName: row.empfaenger_name,
    empfaengerAdresse: row.empfaenger_adresse,
    empfaengerPlz: row.empfaenger_plz,
    empfaengerStadt: row.empfaenger_stadt,
    empfaengerEmail: row.empfaenger_email ?? undefined,
    empfaengerTelefon: row.empfaenger_telefon ?? undefined,
    pakete: row.pakete,
    gewicht: Number(row.gewicht),
    packageLengthCm: row.package_length_cm === null ? undefined : Number(row.package_length_cm),
    packageWidthCm: row.package_width_cm === null ? undefined : Number(row.package_width_cm),
    packageHeightCm: row.package_height_cm === null ? undefined : Number(row.package_height_cm),
    status: row.status as OrderStatus,
    erstelltAm: row.created_at.split("T")[0],
    notizen: row.notizen ?? undefined,
    deliveryAttempts: typeof row.delivery_attempts === "number" ? row.delivery_attempts : 0,
    isPickup: row.is_pickup === true,
  };
}

export function useOrderStore() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!user) { setOrders([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_pickup", false)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Aufträge konnten nicht geladen werden");
      console.error(error);
    } else {
      setOrders((data as unknown as DbOrder[]).map(dbToOrder));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const addOrder = async (order: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        auftrags_nr: "",
        absender_name: order.absenderName,
        absender_adresse: order.absenderAdresse,
        empfaenger_name: order.empfaengerName,
        empfaenger_adresse: order.empfaengerAdresse,
        empfaenger_plz: order.empfaengerPlz,
        empfaenger_stadt: order.empfaengerStadt,
        empfaenger_email: order.empfaengerEmail || null,
        empfaenger_telefon: order.empfaengerTelefon || null,
        pakete: order.pakete,
        gewicht: order.gewicht,
        package_length_cm: order.packageLengthCm ?? null,
        package_width_cm: order.packageWidthCm ?? null,
        package_height_cm: order.packageHeightCm ?? null,
        notizen: order.notizen || null,
      })
      .select()
      .single();
    if (error) {
      toast.error("Auftrag konnte nicht gespeichert werden");
      console.error(error);
      return null;
    }
    const newOrder = dbToOrder(data as unknown as DbOrder);
    setOrders((prev) => [newOrder, ...prev]);
    void geocodeOrder(newOrder);
    void sendOrderStatusEmail({
      orderId: newOrder.id,
      auftragsNr: newOrder.auftragsNr,
      status: "neu",
      empfaengerName: newOrder.empfaengerName,
      empfaengerEmail: newOrder.empfaengerEmail,
      empfaengerAdresse: newOrder.empfaengerAdresse,
      empfaengerPlz: newOrder.empfaengerPlz,
      empfaengerStadt: newOrder.empfaengerStadt,
      haendlerUserId: user.id,
    });
    return newOrder;
  };

  const addOrders = async (newOrders: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">[]) => {
    if (!user) return [];
    const rows = newOrders.map((o) => ({
      user_id: user.id,
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
    const { data, error } = await supabase.from("orders").insert(rows).select();
    if (error) {
      toast.error("Import fehlgeschlagen");
      console.error(error);
      return [];
    }
    const created = (data as unknown as DbOrder[]).map(dbToOrder);
    setOrders((prev) => [...created, ...prev]);
    for (const o of created) {
      void geocodeOrder(o);
    }
    for (const o of created) {
      void sendOrderStatusEmail({
        orderId: o.id,
        auftragsNr: o.auftragsNr,
        status: "neu",
        empfaengerName: o.empfaengerName,
        empfaengerEmail: o.empfaengerEmail,
        empfaengerAdresse: o.empfaengerAdresse,
        empfaengerPlz: o.empfaengerPlz,
        empfaengerStadt: o.empfaengerStadt,
        haendlerUserId: user.id,
      });
    }
    return created;
  };

  const updateStatus = async (id: string, status: OrderStatus, reason?: string) => {
    if (status === "nicht_zugestellt" && !reason?.trim()) {
      toast.error("Bitte einen Grund für Nicht Zugestellt angeben");
      return;
    }

    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) { toast.error("Status konnte nicht aktualisiert werden"); return; }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  };

  const deleteOrder = async (id: string) => {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) { toast.error("Auftrag konnte nicht gelöscht werden"); return; }
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const updateOrder = async (id: string, updates: Partial<Order>) => {
    const dbUpdates: {
      empfaenger_name?: string;
      empfaenger_adresse?: string;
      empfaenger_plz?: string;
      empfaenger_stadt?: string;
      empfaenger_email?: string | null;
      empfaenger_telefon?: string | null;
      pakete?: number;
      gewicht?: number;
      package_length_cm?: number | null;
      package_width_cm?: number | null;
      package_height_cm?: number | null;
      notizen?: string | null;
    } = {};
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
    if (error) { toast.error("Änderungen konnten nicht gespeichert werden"); return; }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  };

  // Realtime subscription for order updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOrder = dbToOrder(payload.new as unknown as DbOrder);
            if (newOrder.isPickup) return;
            setOrders((prev) => {
              if (prev.some((o) => o.id === newOrder.id)) return prev;
              return [newOrder, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = dbToOrder(payload.new as unknown as DbOrder);
            if (updated.isPickup) return;
            setOrders((prev) => {
              const old = prev.find((o) => o.id === updated.id);
              if (old && old.status !== updated.status) {
                toast.info(`Auftrag ${updated.auftragsNr}: Status → ${updated.status === 'unterwegs' ? 'Unterwegs' : updated.status === 'zugestellt' ? 'Zugestellt' : updated.status === 'nicht_zugestellt' ? 'Nicht Zugestellt' : updated.status === 'in_bearbeitung' ? 'In Bearbeitung' : updated.status === 'storniert' ? 'Storniert' : 'Neu'}`);
              }
              return prev.map((o) => (o.id === updated.id ? updated : o));
            });
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setOrders((prev) => prev.filter((o) => o.id !== oldId));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return { orders, loading, addOrder, addOrders, updateStatus, deleteOrder, updateOrder };
}
