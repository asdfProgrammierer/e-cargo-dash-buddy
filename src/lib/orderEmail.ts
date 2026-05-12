import { supabase } from "@/integrations/supabase/client";
import type { OrderStatus } from "@/types/order";
import { buildTrackingUrl } from "@/lib/siteUrl";

const STATUS_TEMPLATE: Partial<Record<OrderStatus, string>> = {
  neu: "order-neu",
  in_bearbeitung: "order-in-bearbeitung",
  unterwegs: "order-unterwegs",
  zugestellt: "order-zugestellt",
  nicht_zugestellt: "order-nicht-zugestellt",
  // storniert: kein Versand
};

// Zusatz-Vorlage für Wiederzustellungen (Versuch 1 / 2 fehlgeschlagen).
// Wird nicht über STATUS_TEMPLATE getriggert, sondern direkt aus dem
// Driver-Edge-Function-Flow. Hier nur als Konstante für Tests.
export const RETRY_TEMPLATE = "order-zustellversuch-fehlgeschlagen";

export interface OrderEmailPayload {
  orderId: string;
  auftragsNr: string;
  status: OrderStatus;
  empfaengerName: string;
  empfaengerEmail?: string | null;
  empfaengerAdresse?: string | null;
  empfaengerPlz?: string | null;
  empfaengerStadt?: string | null;
  haendlerUserId: string;
  reason?: string;
}

const merchantNameCache = new Map<string, string>();

async function getMerchantName(userId: string): Promise<string> {
  const cached = merchantNameCache.get(userId);
  if (cached) return cached;
  const { data } = await supabase
    .from("profiles")
    .select("firma_name, ansprechpartner")
    .eq("user_id", userId)
    .maybeSingle();
  const name = (data?.firma_name?.trim() || data?.ansprechpartner?.trim() || "Ihr Händler");
  merchantNameCache.set(userId, name);
  return name;
}

async function getTrackingInfo(
  orderId: string,
): Promise<{ trackingToken: string | null; dhlTrackingNumber: string | null }> {
  const { data } = await supabase
    .from("orders")
    .select("tracking_token, dhl_tracking_number")
    .eq("id", orderId)
    .maybeSingle();
  const row = data as { tracking_token?: string | null; dhl_tracking_number?: string | null } | null;
  return {
    trackingToken: row?.tracking_token ?? null,
    dhlTrackingNumber: row?.dhl_tracking_number ?? null,
  };
}

function buildLieferadresse(p: OrderEmailPayload): string {
  const parts = [
    [p.empfaengerName].filter(Boolean).join(" "),
    [p.empfaengerAdresse].filter(Boolean).join(" "),
    [p.empfaengerPlz, p.empfaengerStadt].filter(Boolean).join(" "),
  ].filter((s) => s && s.trim().length > 0);
  return parts.join(", ");
}

/**
 * Sendet eine Status-E-Mail an den Endkunden, falls eine E-Mail-Adresse hinterlegt ist
 * und der Status eine Benachrichtigung vorsieht. Fehler werden geloggt, nicht geworfen.
 */
export async function sendOrderStatusEmail(payload: OrderEmailPayload): Promise<void> {
  const templateName = STATUS_TEMPLATE[payload.status];
  if (!templateName) return;
  const email = payload.empfaengerEmail?.trim();
  if (!email) return;

  try {
    const haendlerName = await getMerchantName(payload.haendlerUserId);
    const { trackingToken, dhlTrackingNumber } = await getTrackingInfo(payload.orderId);
    // Bei DHL-Aufträgen senden wir keine eigenen Status-Mails – DHL informiert den Kunden.
    if (dhlTrackingNumber && dhlTrackingNumber.trim().length > 0) return;
    const trackingUrl = buildTrackingUrl(trackingToken);
    const templateData: Record<string, string> = {
      kundenname: payload.empfaengerName,
      haendlerName,
      auftragsNr: payload.auftragsNr,
      lieferadresse: buildLieferadresse(payload),
      trackingUrl,
    };
    if (payload.status === "nicht_zugestellt" && payload.reason?.trim()) {
      templateData.reason = payload.reason.trim();
    }

    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName,
        recipientEmail: email,
        idempotencyKey: `order-status-${payload.orderId}-${payload.status}`,
        templateData,
      },
    });
    if (error) console.error("Order status email failed", error);
  } catch (err) {
    console.error("Order status email error", err);
  }
}

/**
 * Lädt die nötigen Order-Felder für die übergebenen IDs aus der DB und
 * versendet pro Auftrag eine Status-E-Mail. Wird verwendet von Stellen,
 * die Order-Status per direktem `update` ändern (z.B. Routenplanung,
 * Massen-Annahme), wo der lokale Order-Kontext nicht vollständig vorliegt.
 */
export async function sendOrderStatusEmailsForIds(
  ids: string[],
  status: OrderStatus,
  reason?: string,
): Promise<void> {
  if (!ids.length) return;
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, auftrags_nr, empfaenger_name, empfaenger_email, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, user_id",
    )
    .in("id", ids);
  if (error || !data) {
    console.error("Bulk status email lookup failed", error);
    return;
  }
  await Promise.all(
    data.map((o) =>
      sendOrderStatusEmail({
        orderId: o.id as string,
        auftragsNr: o.auftrags_nr as string,
        status,
        empfaengerName: (o.empfaenger_name as string) ?? "",
        empfaengerEmail: (o.empfaenger_email as string | null) ?? null,
        empfaengerAdresse: (o.empfaenger_adresse as string | null) ?? null,
        empfaengerPlz: (o.empfaenger_plz as string | null) ?? null,
        empfaengerStadt: (o.empfaenger_stadt as string) ?? "",
        haendlerUserId: o.user_id as string,
        reason,
      }),
    ),
  );
}