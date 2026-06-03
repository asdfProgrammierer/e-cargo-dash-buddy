import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { Order, OrderStatus, STATUS_LABELS } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";

type RGB = [number, number, number];

const STATUS_RGB: Record<OrderStatus, RGB> = {
  neu: [59, 130, 246],
  in_bearbeitung: [234, 179, 8],
  unterwegs: [37, 99, 235],
  zugestellt: [22, 163, 74],
  nicht_zugestellt: [220, 38, 38],
  storniert: [107, 114, 128],
};

interface HistoryEntry {
  id: string;
  status: string;
  reason: string | null;
  created_at: string;
}

interface ProofOfDelivery {
  delivery_mode: string | null;
  delivery_note: string | null;
  delivery_recipient: string | null;
  signature_url: string | null;
  delivery_photo_url: string | null;
  delivered_at: string | null;
  completed_lat: number | null;
  completed_lng: number | null;
  completed_accuracy_m: number | null;
}

async function loadStatusHistory(orderId: string): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from("order_status_history")
    .select("id, status, reason, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Statushistorie konnte nicht geladen werden: ${error.message}`);
  if (!data) return [];
  return data as HistoryEntry[];
}

async function loadProofOfDelivery(orderId: string): Promise<ProofOfDelivery | null> {
  const { data } = await supabase
    .from("route_stops")
    .select("delivery_mode, delivery_note, delivery_recipient, signature_url, delivery_photo_url, delivered_at, completed_lat, completed_lng, completed_accuracy_m")
    .eq("order_id", orderId)
    .in("status", ["erledigt", "uebersprungen"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as ProofOfDelivery) ?? null;
}

async function loadStorageDataUrl(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);
    if (error || !data) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(data);
    });
  } catch {
    return null;
  }
}

async function generateQrDataUrl(order: Order) {
  return QRCode.toDataURL(
    [
      "e-cargo",
      `Auftrag: ${order.auftragsNr}`,
      `Empfänger: ${order.empfaengerName}`,
      `PLZ/Stadt: ${order.empfaengerPlz} ${order.empfaengerStadt}`.trim(),
      `Pakete: ${order.pakete}`,
    ].join("\n"),
    { margin: 0, width: 220, color: { dark: "#000000", light: "#FFFFFF" } },
  );
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: string) {
  return STATUS_LABELS[status as OrderStatus] ?? status;
}

export async function buildOrderPdf(order: Order): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 15;
  const contentW = pageW - marginX * 2;

  const [history, qrDataUrl, pod] = await Promise.all([
    loadStatusHistory(order.id),
    generateQrDataUrl(order),
    loadProofOfDelivery(order.id),
  ]);
  const sigDataUrl = pod?.signature_url
    ? await loadStorageDataUrl("delivery-signatures", pod.signature_url)
    : null;
  const photoDataUrl = pod?.delivery_photo_url
    ? await loadStorageDataUrl("delivery-photos", pod.delivery_photo_url)
    : null;

  // ============ PAGE 1: Auftragsübersicht ============
  let y = 18;

  // Header: brand + title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("e-cargo", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Wir liefern 100% elektrisch.", marginX, y + 5);
  doc.setTextColor(0);

  // QR top-right (kleiner, damit Status-Badge darunter Platz hat)
  doc.addImage(qrDataUrl, "PNG", pageW - marginX - 20, y - 4, 20, 20);

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Auftrag / Lieferschein", marginX, y);

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Auftrags-Nr.`, marginX, y);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(order.auftragsNr, marginX + 26, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Erstellt: ${order.erstelltAm}`, marginX + 90, y);
  doc.setTextColor(0);

  // Status badge (right side, below QR area)
  const badgeColor = STATUS_RGB[order.status];
  const badgeLabel = statusLabel(order.status).toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const badgeW = doc.getTextWidth(badgeLabel) + 8;
  const badgeX = pageW - marginX - badgeW;
  const badgeY = y - 4;
  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.roundedRect(badgeX, badgeY, badgeW, 6, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(badgeLabel, badgeX + 4, badgeY + 4.2);
  doc.setTextColor(0);

  y += 6;
  doc.setDrawColor(200);
  doc.line(marginX, y, pageW - marginX, y);
  y += 7;

  // Two columns: Absender / Empfänger
  const colW = (contentW - 6) / 2;
  const colTop = y;

  const drawAddressBlock = (
    title: string, x: number, lines: Array<[string, string | undefined | null]>,
  ) => {
    let cy = colTop;
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(x, cy, colW, 6, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(title.toUpperCase(), x + 3, cy + 4.2);
    doc.setTextColor(0);
    cy += 9;
    doc.setFontSize(10);
    for (const [label, value] of lines) {
      if (!value) continue;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(110);
      doc.text(label, x, cy);
      doc.setTextColor(0);
      doc.setFont("helvetica", value === lines[0][1] ? "bold" : "normal");
      const wrapped = doc.splitTextToSize(String(value), colW - 22);
      doc.text(wrapped, x + 22, cy);
      cy += 4.6 * wrapped.length + 0.6;
    }
    return cy;
  };

  const senderEnd = drawAddressBlock("Absender", marginX, [
    ["Name", order.absenderName],
    ["Adresse", order.absenderAdresse],
  ]);

  const recipientEnd = drawAddressBlock("Empfänger", marginX + colW + 6, [
    ["Name", order.empfaengerName],
    ["Adresse", order.empfaengerAdresse],
    ["PLZ/Stadt", `${order.empfaengerPlz ?? ""} ${order.empfaengerStadt}`.trim()],
    ["E-Mail", order.empfaengerEmail],
    ["Telefon", order.empfaengerTelefon],
  ]);

  y = Math.max(senderEnd, recipientEnd) + 6;

  // Sendungsdetails
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(marginX, y, contentW, 6, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("SENDUNGSDETAILS", marginX + 3, y + 4.2);
  doc.setTextColor(0);
  y += 9;

  const dims =
    order.packageLengthCm || order.packageWidthCm || order.packageHeightCm
      ? `${order.packageLengthCm ?? 0} × ${order.packageWidthCm ?? 0} × ${order.packageHeightCm ?? 0} cm`
      : "—";
  const volumeL =
    order.packageLengthCm && order.packageWidthCm && order.packageHeightCm
      ? ((order.packageLengthCm * order.packageWidthCm * order.packageHeightCm) / 1000).toFixed(1) + " L"
      : "—";
  const co2 = (order.pakete * 0.5).toFixed(1) + " kg";

  const cells: Array<[string, string]> = [
    ["Pakete", String(order.pakete)],
    ["Gewicht", `${order.gewicht} kg`],
    ["Maße (L×B×H)", dims],
    ["Volumen", volumeL],
    ["CO₂ gespart", co2],
  ];
  const cellW = contentW / cells.length;
  doc.setDrawColor(220);
  doc.roundedRect(marginX, y, contentW, 14, 1.5, 1.5, "S");
  cells.forEach(([label, value], i) => {
    const cx = marginX + cellW * i;
    if (i > 0) doc.line(cx, y, cx, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(label.toUpperCase(), cx + cellW / 2, y + 4.5, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(value, cx + cellW / 2, y + 10.5, { align: "center" });
  });
  y += 18;

  // Notizen
  if (order.notizen) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(234, 179, 8);
    const noteLines = doc.splitTextToSize(order.notizen, contentW - 8);
    const noteH = 8 + noteLines.length * 4.6;
    doc.roundedRect(marginX, y, contentW, noteH, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 80, 0);
    doc.text("HINWEISE", marginX + 4, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(noteLines, marginX + 4, y + 10);
    y += noteH + 6;
  }

  // Statushistorie
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(marginX, y, contentW, 6, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("STATUSHISTORIE", marginX + 3, y + 4.2);
  doc.setTextColor(0);
  y += 9;

  if (history.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(120);
    doc.text("Keine Statusänderungen protokolliert.", marginX, y + 4);
    doc.setTextColor(0);
    y += 8;
  } else {
    // Header row
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text("DATUM", marginX, y);
    doc.text("STATUS", marginX + 42, y);
    doc.text("GRUND", marginX + 78, y);
    doc.setTextColor(0);
    y += 2;
    doc.setDrawColor(220);
    doc.line(marginX, y, pageW - marginX, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const h of history) {
      if (y > pageH - 30) { doc.addPage(); y = 20; }
      const reasonLines = doc.splitTextToSize(h.reason ?? "—", contentW - 78);
      doc.text(formatDateTime(h.created_at), marginX, y);
      doc.text(statusLabel(h.status), marginX + 42, y);
      doc.text(reasonLines, marginX + 78, y);
      y += Math.max(5, reasonLines.length * 4.6) + 1;
    }
  }

  // ============ PAGE 2: Lieferschein ============
  doc.addPage();
  y = 18;

  // Cut indicator
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.setDrawColor(150);
  doc.line(marginX, y, pageW - marginX, y);
  doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("✂  Bitte hier abtrennen – Lieferschein zur Quittierung", pageW / 2, y - 1.5, { align: "center" });
  doc.setTextColor(0);
  y += 8;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Lieferschein", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Auftrags-Nr.: ${order.auftragsNr}`, marginX, y + 6);
  doc.text(`Erstellt: ${order.erstelltAm}`, marginX, y + 11);
  doc.setTextColor(0);
  doc.addImage(qrDataUrl, "PNG", pageW - marginX - 20, y - 4, 20, 20);
  y += 20;

  // Empfänger box (prominent)
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, y, contentW, 28, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("EMPFÄNGER", marginX + 4, y + 5);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(order.empfaengerName, marginX + 4, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(order.empfaengerAdresse, marginX + 4, y + 18);
  doc.text(`${order.empfaengerPlz ?? ""} ${order.empfaengerStadt}`.trim(), marginX + 4, y + 24);
  if (order.empfaengerTelefon) {
    doc.setFontSize(9.5);
    doc.setTextColor(90);
    doc.text(`Tel. ${order.empfaengerTelefon}`, pageW - marginX - 4, y + 24, { align: "right" });
    doc.setTextColor(0);
  }
  y += 33;

  // Sendungsinhalt
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(marginX, y, contentW, 6, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("SENDUNGSINHALT", marginX + 3, y + 4.2);
  doc.setTextColor(0);
  y += 9;

  const liefercells: Array<[string, string]> = [
    ["Pakete", String(order.pakete)],
    ["Gewicht", `${order.gewicht} kg`],
    ["Maße", dims],
  ];
  const lcellW = contentW / liefercells.length;
  doc.setDrawColor(220);
  doc.roundedRect(marginX, y, contentW, 14, 1.5, 1.5, "S");
  liefercells.forEach(([label, value], i) => {
    const cx = marginX + lcellW * i;
    if (i > 0) doc.line(cx, y, cx, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(label.toUpperCase(), cx + lcellW / 2, y + 4.5, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(value, cx + lcellW / 2, y + 10.5, { align: "center" });
  });
  y += 20;

  // Übergabe / Quittierung
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(marginX, y, contentW, 6, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("QUITTIERUNG DER ÜBERGABE", marginX + 3, y + 4.2);
  doc.setTextColor(0);
  y += 11;

  // Date / time line — pre-fill if proof of delivery exists
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const deliveredDate = pod?.delivered_at ? new Date(pod.delivered_at) : null;
  doc.text("Übernommen am:", marginX, y);
  doc.line(marginX + 32, y + 0.5, marginX + 75, y + 0.5);
  if (deliveredDate) {
    doc.text(deliveredDate.toLocaleDateString("de-DE"), marginX + 34, y - 0.5);
  }
  doc.text("Uhrzeit:", marginX + 85, y);
  doc.line(marginX + 100, y + 0.5, marginX + 130, y + 0.5);
  if (deliveredDate) {
    doc.text(
      deliveredDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      marginX + 102,
      y - 0.5,
    );
  }
  y += 8;

  doc.text("Name (Druckbuchstaben):", marginX, y);
  doc.line(marginX + 48, y + 0.5, pageW - marginX, y + 0.5);
  if (pod?.delivery_recipient) {
    doc.text(pod.delivery_recipient, marginX + 50, y - 0.5);
  }
  y += 8;

  // Checkboxes — auto-mark based on delivery_mode
  const mode = pod?.delivery_mode ?? null;
  const drawCheckbox = (cx: number, cy: number, label: string, checked = false) => {
    doc.setDrawColor(0);
    doc.rect(cx, cy - 3, 3.5, 3.5, "S");
    if (checked) {
      doc.setFont("helvetica", "bold");
      doc.text("X", cx + 0.6, cy);
      doc.setFont("helvetica", "normal");
    }
    doc.text(label, cx + 5, cy);
  };
  drawCheckbox(marginX, y, "Persönlich übergeben", mode === "persoenlich");
  drawCheckbox(marginX + 50, y, "Briefkasten", mode === "briefkasten");
  drawCheckbox(marginX + 85, y, "An Nachbarn", mode === "nachbar");
  drawCheckbox(marginX + 120, y, "Bemerkung:", mode === "bemerkung");
  doc.line(marginX + 145, y + 0.5, pageW - marginX, y + 0.5);
  if (mode === "bemerkung" && pod?.delivery_note) {
    doc.text(pod.delivery_note.slice(0, 40), marginX + 147, y - 0.5);
  }
  y += 10;

  // Signature box
  doc.setDrawColor(0);
  doc.roundedRect(marginX, y, contentW, 28, 2, 2, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("UNTERSCHRIFT EMPFÄNGER", marginX + 3, y + 5);
  doc.setTextColor(0);
  if (sigDataUrl) {
    try {
      doc.addImage(sigDataUrl, "PNG", marginX + 3, y + 6, contentW - 6, 20);
    } catch (e) {
      console.warn("Konnte Unterschrift nicht ins PDF einbetten", e);
    }
  }
  y += 32;

  // GPS-Stempel des Fahrers beim Abschluss
  if (pod?.completed_lat != null && pod?.completed_lng != null) {
    const lat = Number(pod.completed_lat);
    const lng = Number(pod.completed_lng);
    const acc = pod.completed_accuracy_m != null ? Number(pod.completed_accuracy_m) : null;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    const gpsLine =
      `GPS-Stempel: ${lat.toFixed(5)}, ${lng.toFixed(5)}` +
      (acc != null ? `  (±${Math.round(acc)} m)` : "");
    doc.text(gpsLine, marginX, y);
    doc.setTextColor(0);
    y += 5;
  }

  // Delivery photo (briefkasten / nachbar)
  if (photoDataUrl) {
    if (y > pageH - 90) { doc.addPage(); y = 18; }
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(marginX, y, contentW, 6, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text("ZUSTELLFOTO", marginX + 3, y + 4.2);
    doc.setTextColor(0);
    y += 9;
    const photoH = 70;
    doc.setDrawColor(200);
    doc.roundedRect(marginX, y, contentW, photoH, 1.5, 1.5, "S");
    try {
      const fmt = photoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      // Fit centered inside the box
      doc.addImage(photoDataUrl, fmt, marginX + 2, y + 2, contentW - 4, photoH - 4, undefined, "FAST");
    } catch (e) {
      console.warn("Konnte Zustellfoto nicht ins PDF einbetten", e);
    }
    y += photoH + 6;
  }

  // Bemerkungen Fahrer
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(marginX, y, contentW, 6, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("BEMERKUNGEN FAHRER", marginX + 3, y + 4.2);
  doc.setTextColor(0);
  y += 8;

  doc.setDrawColor(200);
  for (let i = 0; i < 4; i++) {
    y += 6;
    doc.line(marginX, y, pageW - marginX, y);
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`e-cargo · ${order.auftragsNr}`, marginX, pageH - 8);
    doc.text(`Seite ${i} / ${pageCount}`, pageW - marginX, pageH - 8, { align: "right" });
    doc.setTextColor(0);
  }

  return doc;
}

export async function buildOrderPdfBlob(order: Order): Promise<Blob> {
  const doc = await buildOrderPdf(order);
  return doc.output("blob");
}

async function downloadArchivedDeliveryNote(order: Order): Promise<boolean> {
  const { data: stop } = await supabase
    .from("route_stops")
    .select("delivery_note_pdf_url")
    .eq("order_id", order.id)
    .not("delivery_note_pdf_url", "is", null)
    .order("delivered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const path = (stop as { delivery_note_pdf_url?: string } | null)?.delivery_note_pdf_url;
  if (!path) return false;
  const { data, error } = await supabase.storage.from("delivery-notes").download(path);
  if (error || !data) return false;
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auftrag-${order.auftragsNr}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export async function downloadOrderPdf(order: Order) {
  // Prefer the archived (signed) PDF generated when the driver completed the stop
  if (await downloadArchivedDeliveryNote(order)) return;
  const doc = await buildOrderPdf(order);
  doc.save(`auftrag-${order.auftragsNr}.pdf`);
}
