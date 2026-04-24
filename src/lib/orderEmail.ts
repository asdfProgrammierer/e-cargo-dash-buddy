import { supabase } from "@/integrations/supabase/client";
import type { OrderStatus } from "@/types/order";

const STATUS_TEMPLATE: Partial<Record<OrderStatus, string>> = {
  neu: "order-neu",
  in_bearbeitung: "order-in-bearbeitung",
  unterwegs: "order-unterwegs",
  zugestellt: "order-zugestellt",
  nicht_zugestellt: "order-nicht-zugestellt",
  // storniert: kein Versand
};

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

const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location?.origin) || "https://ecargo-logistic.de";

async function getTrackingToken(orderId: string): Promise<string | null> {
  const { data } = await supabase
    .from("orders")
    .select("tracking_token")
    .eq("id", orderId)
    .maybeSingle();
  return (data as { tracking_token?: string | null } | null)?.tracking_token ?? null;
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
    const token = await getTrackingToken(payload.orderId);
    const trackingUrl = token ? `${SITE_ORIGIN}/track/${token}` : "";
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