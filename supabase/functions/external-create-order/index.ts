import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildTrackingUrl, getPublicSiteUrl } from "../_shared/site-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function err(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "Method not allowed");

  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey.startsWith("ec_live_")) return err(401, "Missing or invalid X-API-Key header");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const keyHash = await sha256Hex(apiKey);
  const { data: keyRow } = await admin
    .from("merchant_api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (!keyRow || keyRow.revoked_at) return err(401, "Invalid or revoked API key");

  const merchantUserId = keyRow.user_id as string;

  // Update last_used_at (fire-and-forget)
  void admin.from("merchant_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, "Invalid JSON body"); }

  const str = (v: unknown, max = 500) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  const externalRef = str(body.external_ref, 120);
  const empfaengerName = str(body.empfaenger_name, 200);
  const empfaengerStrasse = str(body.empfaenger_strasse ?? body.empfaenger_adresse, 250);
  const empfaengerPlz = str(body.empfaenger_plz, 10);
  const empfaengerStadt = str(body.empfaenger_stadt, 120);
  const empfaengerEmail = str(body.empfaenger_email, 200) || null;
  const empfaengerTelefon = str(body.empfaenger_telefon, 50) || null;
  const notizen = str(body.notizen, 1000) || null;
  let pakete = Number(body.pakete ?? 1);
  if (!Number.isFinite(pakete) || pakete < 1) pakete = 1;
  if (pakete > 99) pakete = 99;
  let gewicht = Number(body.gewicht ?? 0);
  if (!Number.isFinite(gewicht) || gewicht < 0) gewicht = 0;

  if (!empfaengerName) return err(400, "empfaenger_name required");
  if (!empfaengerStadt) return err(400, "empfaenger_stadt required");

  // Load merchant profile for sender defaults
  const { data: profile } = await admin
    .from("profiles")
    .select("firma_name, ansprechpartner, strasse, plz, stadt, merchant_code")
    .eq("user_id", merchantUserId)
    .maybeSingle();

  if (!profile?.merchant_code) {
    return err(409, "Merchant has no merchant_code configured – contact e-cargo admin");
  }

  const absenderName = profile.firma_name?.trim() || profile.ansprechpartner?.trim() || "Händler";
  const absenderAdresse = [profile.strasse, profile.plz, profile.stadt].filter(Boolean).join(", ");

  // Idempotency: same merchant + external_ref must return the existing order
  if (externalRef) {
    const { data: existing } = await admin
      .from("orders")
      .select("id, auftrags_nr, tracking_token, status")
      .eq("user_id", merchantUserId)
      .eq("external_order_ref", externalRef)
      .is("shop_connection_id", null)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({
        order_id: existing.id,
        auftrags_nr: existing.auftrags_nr,
        tracking_url: buildTrackingUrl(existing.tracking_token, req),
        label_url: `${getPublicSiteUrl(req)}/track/${existing.tracking_token}`,
        status: existing.status,
        idempotent: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const { data: inserted, error: insertErr } = await admin.from("orders").insert({
    user_id: merchantUserId,
    auftrags_nr: "",
    absender_name: absenderName,
    absender_adresse: absenderAdresse,
    empfaenger_name: empfaengerName,
    empfaenger_adresse: empfaengerStrasse,
    empfaenger_plz: empfaengerPlz,
    empfaenger_stadt: empfaengerStadt,
    empfaenger_email: empfaengerEmail,
    empfaenger_telefon: empfaengerTelefon,
    pakete,
    gewicht,
    notizen,
    external_order_ref: externalRef || null,
  }).select("id, auftrags_nr, tracking_token, status").single();

  if (insertErr || !inserted) {
    console.error("external-create-order insert failed", insertErr);
    return err(500, insertErr?.message ?? "Insert failed");
  }

  // Auto-geocode (fire-and-forget so the WaWi gets a fast response)
  void (async () => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/geocode-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ strasse: empfaengerStrasse, plz: empfaengerPlz, stadt: empfaengerStadt }),
      });
      if (res.ok) {
        const geo = await res.json() as { lat?: number; lng?: number };
        if (geo.lat && geo.lng) {
          await admin.from("orders")
            .update({ lat: geo.lat, lng: geo.lng, geocoded_at: new Date().toISOString() })
            .eq("id", inserted.id);
        }
      }
    } catch (e) { console.warn("auto-geocode failed", e); }
  })();

  // Trigger order-neu email (fire-and-forget)
  if (empfaengerEmail) {
    const lieferadresse = [
      empfaengerName,
      empfaengerStrasse,
      [empfaengerPlz, empfaengerStadt].filter(Boolean).join(" "),
    ].filter((s) => s && s.trim().length > 0).join(", ");
    void fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        templateName: "order-neu",
        recipientEmail: empfaengerEmail,
        idempotencyKey: `order-status-${inserted.id}-neu`,
        templateData: {
          kundenname: empfaengerName,
          haendlerName: absenderName,
          auftragsNr: inserted.auftrags_nr,
          lieferadresse,
          trackingUrl,
        },
      }),
    }).catch((e) => console.warn("email trigger failed", e));
  }

  return new Response(JSON.stringify({
    order_id: inserted.id,
    auftrags_nr: inserted.auftrags_nr,
    tracking_url: trackingUrl,
    label_url: trackingUrl,
    status: inserted.status,
  }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});