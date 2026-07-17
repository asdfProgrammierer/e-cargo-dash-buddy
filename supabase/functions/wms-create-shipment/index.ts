// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";
import bwipjs from "npm:bwip-js@4.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wms-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PUBLIC_SITE_URL = "https://ecargo-connect.ecargo-logistik.de";

type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "UNKNOWN_MERCHANT"
  | "OUT_OF_COVERAGE"
  | "DUPLICATE_REFERENCE_CONFLICT"
  | "LABEL_RENDER_FAILED"
  | "INTERNAL_ERROR";

function jsonError(code: ErrorCode, message: string, details: any = {}, status = 400) {
  return new Response(
    JSON.stringify({ error: { code, message, details } }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function ok(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

type Payload = {
  merchant_reference: string;
  external_order_ref: string;
  recipient: {
    name: string;
    street: string;
    postal_code: string;
    city: string;
    country?: string;
    email?: string;
    phone?: string;
  };
  sender?: {
    name?: string;
    street?: string;
    postal_code?: string;
    city?: string;
  };
  package: {
    count: number;
    weight_kg: number;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
  };
  notes?: string;
};

function validatePayload(raw: any): { ok: true; value: Payload } | { ok: false; details: Record<string, string> } {
  const errors: Record<string, string> = {};
  const merchant_reference = normStr(raw?.merchant_reference).toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(merchant_reference)) errors.merchant_reference = "muss 3-stelliger Händlercode sein (A-Z, 0-9)";

  const external_order_ref = normStr(raw?.external_order_ref);
  if (!external_order_ref) errors.external_order_ref = "erforderlich";
  if (external_order_ref.length > 128) errors.external_order_ref = "max. 128 Zeichen";

  const r = raw?.recipient ?? {};
  const recipient = {
    name: normStr(r.name),
    street: normStr(r.street),
    postal_code: normStr(r.postal_code),
    city: normStr(r.city),
    country: normStr(r.country) || "DE",
    email: normStr(r.email),
    phone: normStr(r.phone),
  };
  if (!recipient.name) errors["recipient.name"] = "erforderlich";
  if (!recipient.street) errors["recipient.street"] = "erforderlich";
  if (!/^\d{5}$/.test(recipient.postal_code)) errors["recipient.postal_code"] = "muss 5 Ziffern sein";
  if (!recipient.city) errors["recipient.city"] = "erforderlich";
  if (recipient.email && !isEmail(recipient.email)) errors["recipient.email"] = "ungültige E-Mail";

  const p = raw?.package ?? {};
  const count = normNum(p.count);
  const weight = normNum(p.weight_kg);
  if (count === null || count < 1 || count > 99) errors["package.count"] = "1-99 erforderlich";
  if (weight === null || weight < 0 || weight > 1000) errors["package.weight_kg"] = "0-1000 kg";

  const s = raw?.sender ?? {};
  const sender = {
    name: normStr(s.name),
    street: normStr(s.street),
    postal_code: normStr(s.postal_code),
    city: normStr(s.city),
  };

  if (Object.keys(errors).length > 0) return { ok: false, details: errors };

  return {
    ok: true,
    value: {
      merchant_reference,
      external_order_ref,
      recipient: {
        ...recipient,
        email: recipient.email || undefined,
        phone: recipient.phone || undefined,
      },
      sender: sender.name || sender.street ? sender : undefined,
      package: {
        count: Math.round(count!),
        weight_kg: weight!,
        length_cm: normNum(p.length_cm) ?? undefined,
        width_cm: normNum(p.width_cm) ?? undefined,
        height_cm: normNum(p.height_cm) ?? undefined,
      },
      notes: normStr(raw?.notes) || undefined,
    },
  };
}

async function buildLabelPdf(params: {
  auftragsNr: string;
  trackingUrl: string;
  recipient: Payload["recipient"];
  sender: { name: string; street: string; postal_code: string; city: string };
  packageCount: number;
  weightKg: number;
  createdAt: string;
  zoneLabel: string | null;
}): Promise<Uint8Array> {
  const qrPngDataUrl = await QRCode.toDataURL(params.trackingUrl, {
    margin: 0,
    width: 360,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  const qrBytes = Uint8Array.from(atob(qrPngDataUrl.split(",")[1]), (c) => c.charCodeAt(0));

  const barcodePng: Uint8Array = await bwipjs.toBuffer({
    bcid: "code128",
    text: params.auftragsNr,
    scale: 3,
    height: 12,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });

  const doc = await PDFDocument.create();
  // 100mm x 150mm in PDF points (1mm = 2.83464567)
  const mm = 2.83464567;
  const page = doc.addPage([100 * mm, 150 * mm]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const W = 100 * mm;
  const H = 150 * mm;

  // Border
  page.drawRectangle({
    x: 1.2 * mm,
    y: 1.2 * mm,
    width: W - 2.4 * mm,
    height: H - 2.4 * mm,
    borderWidth: 1.2 * mm,
    borderColor: rgb(0, 0, 0),
  });

  const padX = 5 * mm;
  let y = H - 5 * mm;

  // Header: brand + zone/order
  page.drawText("e-cargo", { x: padX, y: y - 6 * mm, size: 22, font: helvBold });
  page.drawText("Wir liefern 100% elektrisch.", { x: padX, y: y - 10 * mm, size: 8, font: helvBold });

  if (params.zoneLabel) {
    const zw = helvBold.widthOfTextAtSize(params.zoneLabel, 12) + 6 * mm;
    page.drawRectangle({
      x: W - padX - zw,
      y: y - 6.5 * mm,
      width: zw,
      height: 6 * mm,
      borderWidth: 0.4,
      borderColor: rgb(0, 0, 0),
    });
    page.drawText(params.zoneLabel, {
      x: W - padX - zw + 3 * mm,
      y: y - 5 * mm,
      size: 12,
      font: helvBold,
    });
  }
  const nrWidth = mono.widthOfTextAtSize(params.auftragsNr, 10) + 5 * mm;
  page.drawRectangle({
    x: W - padX - nrWidth,
    y: y - 13 * mm,
    width: nrWidth,
    height: 5 * mm,
    borderWidth: 0.4,
    borderColor: rgb(0, 0, 0),
  });
  page.drawText(params.auftragsNr, {
    x: W - padX - nrWidth + 2.5 * mm,
    y: y - 12 * mm,
    size: 10,
    font: mono,
  });

  y = H - 20 * mm;

  // Recipient box
  const recipientBoxH = 32 * mm;
  page.drawRectangle({
    x: padX,
    y: y - recipientBoxH,
    width: W - 2 * padX,
    height: recipientBoxH,
    borderWidth: 0.4,
    borderColor: rgb(0, 0, 0),
  });
  page.drawText("EMPFÄNGER", { x: padX + 2 * mm, y: y - 4 * mm, size: 7, font: helv, color: rgb(0.37, 0.37, 0.37) });
  page.drawText(params.recipient.name.slice(0, 34), { x: padX + 2 * mm, y: y - 9 * mm, size: 14, font: helvBold });
  page.drawText(params.recipient.street.slice(0, 40), { x: padX + 2 * mm, y: y - 14 * mm, size: 11, font: helvBold });
  page.drawText(
    `${params.recipient.postal_code} ${params.recipient.city}`.slice(0, 40),
    { x: padX + 2 * mm, y: y - 19 * mm, size: 11, font: helvBold },
  );
  if (params.recipient.country && params.recipient.country !== "DE") {
    page.drawText(params.recipient.country, { x: padX + 2 * mm, y: y - 24 * mm, size: 10, font: helvBold });
  }
  if (params.recipient.phone) {
    page.drawText(`Tel. ${params.recipient.phone}`, { x: padX + 2 * mm, y: y - 29 * mm, size: 8, font: helv, color: rgb(0.37, 0.37, 0.37) });
  }

  y -= recipientBoxH + 3 * mm;

  // Sender + QR side-by-side
  const halfW = (W - 2 * padX - 2.5 * mm) / 2;
  const senderBoxH = 25 * mm;
  page.drawRectangle({ x: padX, y: y - senderBoxH, width: halfW, height: senderBoxH, borderWidth: 0.35, borderColor: rgb(0, 0, 0) });
  page.drawText("ABSENDER", { x: padX + 2 * mm, y: y - 4 * mm, size: 7, font: helv, color: rgb(0.37, 0.37, 0.37) });
  page.drawText(params.sender.name.slice(0, 26), { x: padX + 2 * mm, y: y - 9 * mm, size: 9, font: helvBold });
  page.drawText(params.sender.street.slice(0, 30), { x: padX + 2 * mm, y: y - 13 * mm, size: 8, font: helv });
  page.drawText(`${params.sender.postal_code} ${params.sender.city}`.slice(0, 30), {
    x: padX + 2 * mm,
    y: y - 17 * mm,
    size: 8,
    font: helv,
  });

  page.drawRectangle({
    x: padX + halfW + 2.5 * mm,
    y: y - senderBoxH,
    width: halfW,
    height: senderBoxH,
    borderWidth: 0.35,
    borderColor: rgb(0, 0, 0),
  });
  const qrImg = await doc.embedPng(qrBytes);
  const qrSize = 22 * mm;
  page.drawImage(qrImg, {
    x: padX + halfW + 2.5 * mm + (halfW - qrSize) / 2,
    y: y - senderBoxH + (senderBoxH - qrSize) / 2,
    width: qrSize,
    height: qrSize,
  });

  y -= senderBoxH + 3 * mm;

  // Meta row
  const metaW = (W - 2 * padX - 2 * 2 * mm) / 3;
  const metaH = 10 * mm;
  const metas = [
    ["PAKETE", String(params.packageCount)],
    ["GEWICHT", `${params.weightKg} kg`],
    ["DATUM", params.createdAt],
  ];
  metas.forEach(([lbl, val], i) => {
    const bx = padX + i * (metaW + 2 * mm);
    page.drawRectangle({ x: bx, y: y - metaH, width: metaW, height: metaH, borderWidth: 0.35, borderColor: rgb(0, 0, 0), color: rgb(0.957, 0.957, 0.957) });
    page.drawText(lbl, { x: bx + 2 * mm, y: y - 3.5 * mm, size: 6.5, font: helv, color: rgb(0.37, 0.37, 0.37) });
    const vw = helvBold.widthOfTextAtSize(val, 11);
    page.drawText(val, { x: bx + (metaW - vw) / 2, y: y - 8 * mm, size: 11, font: helvBold });
  });

  y -= metaH + 3 * mm;

  // Barcode card
  const barBoxH = 20 * mm;
  page.drawRectangle({ x: padX, y: y - barBoxH, width: W - 2 * padX, height: barBoxH, borderWidth: 0.4, borderColor: rgb(0, 0, 0) });
  page.drawText("SENDUNGSNUMMER", { x: padX + 2 * mm, y: y - 3.5 * mm, size: 7, font: helv, color: rgb(0.37, 0.37, 0.37) });
  const barcodeImg = await doc.embedPng(barcodePng);
  const barcodeW = W - 2 * padX - 6 * mm;
  const barcodeH = 10 * mm;
  page.drawImage(barcodeImg, {
    x: padX + 3 * mm,
    y: y - 4 * mm - barcodeH,
    width: barcodeW,
    height: barcodeH,
  });
  const nrCentered = params.auftragsNr;
  const nrW = mono.widthOfTextAtSize(nrCentered, 10);
  page.drawText(nrCentered, {
    x: padX + (W - 2 * padX - nrW) / 2,
    y: y - barBoxH + 2 * mm,
    size: 10,
    font: mono,
  });

  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("VALIDATION_ERROR", "Nur POST erlaubt", {}, 405);

  // API-Key
  const providedKey = req.headers.get("x-wms-api-key") ?? "";
  const expectedKey = Deno.env.get("WMS_API_KEY") ?? "";
  if (!expectedKey || !providedKey || !constantTimeEqual(providedKey, expectedKey)) {
    return jsonError("UNAUTHORIZED", "Ungültiger oder fehlender API-Schlüssel", {}, 401);
  }

  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return jsonError("VALIDATION_ERROR", "Ungültiges JSON", {}, 400);
  }

  const parsed = validatePayload(raw);
  if (!parsed.ok) {
    return jsonError("VALIDATION_ERROR", "Eingabe ungültig", parsed.details, 400);
  }
  const payload = parsed.value;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Merchant lookup
  const { data: merchant, error: merchantErr } = await admin
    .from("profiles")
    .select("user_id, firma_name, ansprechpartner, strasse, plz, stadt, merchant_code, approved")
    .eq("merchant_code", payload.merchant_reference)
    .maybeSingle();

  if (merchantErr) return jsonError("INTERNAL_ERROR", "Händler-Lookup fehlgeschlagen", { db: merchantErr.message }, 500);
  if (!merchant) return jsonError("UNKNOWN_MERCHANT", "Unbekannter Händlercode", { merchant_reference: payload.merchant_reference }, 400);
  if (!merchant.approved) return jsonError("UNKNOWN_MERCHANT", "Händler nicht freigegeben", { merchant_reference: payload.merchant_reference }, 400);

  // Coverage check
  const { data: cover } = await admin
    .from("delivery_zone_postcodes")
    .select("postcode, delivery_zones(label)")
    .eq("postcode", payload.recipient.postal_code)
    .maybeSingle();
  if (!cover) {
    return jsonError(
      "OUT_OF_COVERAGE",
      "Empfänger-PLZ liegt außerhalb des e-cargo-Liefergebiets",
      { postal_code: payload.recipient.postal_code },
      422,
    );
  }
  const zoneRel = (cover as any).delivery_zones;
  const zoneLabel: string | null = Array.isArray(zoneRel) ? zoneRel[0]?.label ?? null : zoneRel?.label ?? null;

  // Idempotency hash
  const hashSource = JSON.stringify({
    merchant: payload.merchant_reference,
    ref: payload.external_order_ref,
    recipient: payload.recipient,
    pkg: payload.package,
    notes: payload.notes ?? "",
  });
  const hash = await sha256Hex(hashSource);

  // Existing order?
  const { data: existing } = await admin
    .from("orders")
    .select("id, auftrags_nr, tracking_token, external_source_hash, created_at")
    .eq("source_system", "wms")
    .eq("external_source_ref", payload.external_order_ref)
    .maybeSingle();

  const senderName = payload.sender?.name || merchant.firma_name || merchant.ansprechpartner || "e-cargo Händler";
  const senderStreet = payload.sender?.street || merchant.strasse || "";
  const senderPlz = payload.sender?.postal_code || merchant.plz || "";
  const senderStadt = payload.sender?.city || merchant.stadt || "";

  let orderId: string;
  let auftragsNr: string;
  let trackingToken: string;
  let createdAt: string;

  if (existing) {
    if (existing.external_source_hash && existing.external_source_hash !== hash) {
      return jsonError(
        "DUPLICATE_REFERENCE_CONFLICT",
        "Referenz existiert bereits mit anderen Daten",
        { external_order_ref: payload.external_order_ref, existing_tracking_number: existing.auftrags_nr },
        409,
      );
    }
    orderId = existing.id;
    auftragsNr = existing.auftrags_nr;
    trackingToken = existing.tracking_token as string;
    createdAt = existing.created_at as string;
  } else {
    const absender_adresse = [senderStreet, `${senderPlz} ${senderStadt}`.trim()].filter(Boolean).join(", ");
    const { data: inserted, error: insErr } = await admin
      .from("orders")
      .insert({
        user_id: merchant.user_id,
        auftrags_nr: "",
        absender_name: senderName,
        absender_adresse,
        empfaenger_name: payload.recipient.name,
        empfaenger_adresse: payload.recipient.street,
        empfaenger_plz: payload.recipient.postal_code,
        empfaenger_stadt: payload.recipient.city,
        empfaenger_email: payload.recipient.email ?? null,
        empfaenger_telefon: payload.recipient.phone ?? null,
        pakete: payload.package.count,
        gewicht: payload.package.weight_kg,
        package_length_cm: payload.package.length_cm ?? null,
        package_width_cm: payload.package.width_cm ?? null,
        package_height_cm: payload.package.height_cm ?? null,
        notizen: payload.notes ?? null,
        source_system: "wms",
        external_source_ref: payload.external_order_ref,
        external_source_hash: hash,
      })
      .select("id, auftrags_nr, tracking_token, created_at")
      .single();

    if (insErr || !inserted) {
      if (insErr?.code === "23505") {
        return jsonError(
          "DUPLICATE_REFERENCE_CONFLICT",
          "Referenz wurde parallel angelegt",
          { external_order_ref: payload.external_order_ref },
          409,
        );
      }
      return jsonError("INTERNAL_ERROR", "Auftrag konnte nicht angelegt werden", { db: insErr?.message ?? "unknown" }, 500);
    }
    orderId = inserted.id;
    auftragsNr = inserted.auftrags_nr;
    trackingToken = inserted.tracking_token as string;
    createdAt = inserted.created_at as string;
  }

  const trackingUrl = `${PUBLIC_SITE_URL}/track/${trackingToken}`;
  const dateStr = new Date(createdAt).toLocaleDateString("de-DE");

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildLabelPdf({
      auftragsNr,
      trackingUrl,
      recipient: payload.recipient,
      sender: { name: senderName, street: senderStreet, postal_code: senderPlz, city: senderStadt },
      packageCount: payload.package.count,
      weightKg: payload.package.weight_kg,
      createdAt: dateStr,
      zoneLabel,
    });
  } catch (e) {
    return jsonError("LABEL_RENDER_FAILED", "Etikett konnte nicht erzeugt werden", { message: String(e) }, 500);
  }

  // Upload to storage
  const storagePath = `wms/${orderId}.pdf`;
  const { error: upErr } = await admin.storage.from("delivery-notes").upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    return jsonError("INTERNAL_ERROR", "Etikett-Upload fehlgeschlagen", { storage: upErr.message }, 500);
  }
  const { data: signed, error: signErr } = await admin.storage
    .from("delivery-notes")
    .createSignedUrl(storagePath, 60 * 60 * 24);
  if (signErr || !signed) {
    return jsonError("INTERNAL_ERROR", "Signierte URL fehlgeschlagen", { storage: signErr?.message ?? "unknown" }, 500);
  }

  const base64 = btoa(String.fromCharCode(...pdfBytes));

  return ok({
    shipment_id: orderId,
    tracking_number: auftragsNr,
    tracking_url: trackingUrl,
    zone_label: zoneLabel,
    label: {
      format: "pdf",
      size: "100x150mm",
      pdf_base64: base64,
      download_url: signed.signedUrl,
      download_url_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    created_at: createdAt,
  }, 201);
});