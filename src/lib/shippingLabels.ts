import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/types/order";

type ZoneMeta = {
  label: string;
};

function escapeHtml(value?: string) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getZoneMetaForPostcode(postcode?: string) {
  const normalized = postcode?.trim();

  if (!normalized || !/^\d{5}$/.test(normalized)) {
    return null;
  }

  const { data, error } = await supabase
    .from("delivery_zone_postcodes")
    .select("delivery_zones(label)")
    .eq("postcode", normalized)
    .maybeSingle();

  if (error || !data?.delivery_zones) {
    return null;
  }

  const zone = Array.isArray(data.delivery_zones) ? data.delivery_zones[0] : data.delivery_zones;

  return zone ? ({ label: zone.label } satisfies ZoneMeta) : null;
}

async function createQrCodeDataUrl(order: Order) {
  return QRCode.toDataURL(
    [
      "e-cargo",
      `Auftrag: ${order.auftragsNr}`,
      `Empfänger: ${order.empfaengerName}`,
      `PLZ/Stadt: ${order.empfaengerPlz} ${order.empfaengerStadt}`.trim(),
      `Pakete: ${order.pakete}`,
    ].join("\n"),
    {
      margin: 0,
      width: 180,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    },
  );
}

function renderSingleLabel(order: Order, zone: ZoneMeta | null, qrCodeDataUrl: string) {
  return `
    <section class="label">
      <div class="accent-bar"></div>
      <div class="content">
        <div class="header">
          <div class="brand-block">
            <div class="brand-row">
              <div>
                <div class="logo">e-cargo</div>
                <div class="eco-line">Wir liefern 100% elektrisch.</div>
              </div>
            </div>
          </div>
          <div class="header-meta">
            ${zone?.label ? `<div class="zone-badge">${escapeHtml(zone.label)}</div>` : ""}
            <div class="order-pill"><div class="order-nr">${escapeHtml(order.auftragsNr)}</div></div>
          </div>
        </div>

        <div class="hero">
          <div class="hero-label">Empfänger</div>
          <div class="recipient">${escapeHtml(order.empfaengerName)}</div>
          <div class="recipient-address">${escapeHtml(order.empfaengerAdresse)}<br/>${escapeHtml(order.empfaengerPlz ? `${order.empfaengerPlz} ` : "")}${escapeHtml(order.empfaengerStadt)}</div>
          ${order.empfaengerTelefon ? `<div class="phone">Tel. ${escapeHtml(order.empfaengerTelefon)}</div>` : ""}
        </div>

        <div class="grid">
          <div class="section">
            <div class="section-title">Absender</div>
            <div class="section-content">${escapeHtml(order.absenderName)}<br/>${escapeHtml(order.absenderAdresse)}</div>
          </div>
          <div class="section service-section">
            <div class="qr-wrap">
              <img src="${qrCodeDataUrl}" alt="QR Code ${escapeHtml(order.auftragsNr)}" class="qr-code" />
            </div>
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
          <span>Thermodruck 100×150 mm</span>
        </div>
      </div>
    </section>
  `;
}

function renderDocument(labels: string, title: string) {
  return `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: 100mm 150mm; margin: 0; }
          @media print {
            body { margin: 0; }
            .label { page-break-after: always; }
            .label:last-child { page-break-after: auto; }
          }
          :root {
            --bg: #ffffff;
            --fg: #000000;
            --muted: #5f5f5f;
            --line: #b5b5b5;
            --soft: #f4f4f4;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #fff;
            color: var(--fg);
            font-family: Inter, Arial, sans-serif;
          }
          .label {
            width: 100mm;
            height: 150mm;
            border: 1.2mm solid #000;
            display: flex;
            flex-direction: column;
            background: #fff;
          }
          .accent-bar {
            display: none;
          }
          .content {
            padding: 5mm;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 3mm;
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
            gap: 1.1mm;
          }
          .brand-row {
            display: flex;
            align-items: flex-start;
            gap: 0;
          }
          .logo {
            font-size: 18px;
            font-weight: 900;
            line-height: 1;
            letter-spacing: 0.3px;
          }
          .eco-line {
            font-size: 9px;
            font-weight: 700;
            margin-top: 0.8mm;
          }
          .header-meta {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 2mm;
          }
          .zone-badge,
          .order-pill {
            border: 0.45mm solid #000;
            border-radius: 999px;
            padding: 1.8mm 3mm;
            background: #fff;
          }
          .zone-badge {
            min-width: 22mm;
            text-align: center;
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 0.8px;
          }
          .order-nr {
            font-size: 11.8px;
            font-weight: 700;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          }
          .hero {
            border: 0.45mm solid #000;
            border-radius: 4mm;
            padding: 4mm;
            background: #fff;
          }
          .hero-label,
          .section-title,
          .barcode-label {
            font-size: 7.8px;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .hero-label { margin-bottom: 1mm; }
          .recipient {
            font-size: 18px;
            font-weight: 800;
            line-height: 1.15;
            margin-bottom: 1.6mm;
          }
          .recipient-address,
          .section-content {
            font-size: 12.4px;
            font-weight: 600;
            line-height: 1.4;
            word-break: break-word;
          }
          .phone {
            font-size: 9.8px;
            color: var(--muted);
            margin-top: 1.8mm;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2.5mm;
          }
          .section {
            border: 0.35mm solid #000;
            border-radius: 3.8mm;
            padding: 3mm;
            background: #fff;
          }
          .service-section {
            display: flex;
            justify-content: center;
            align-items: stretch;
            padding: 3.5mm;
          }
          .qr-wrap {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr-code {
            width: 23mm;
            height: 23mm;
            display: block;
            image-rendering: pixelated;
          }
          .meta {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 2.3mm;
          }
          .meta-item {
            text-align: center;
            border: 0.35mm solid #000;
            border-radius: 3.5mm;
            padding: 2.8mm 1.5mm;
            background: var(--soft);
          }
          .meta-value {
            font-size: 16px;
            font-weight: 800;
            line-height: 1.15;
            margin-top: 0.8mm;
          }
          .barcode-card {
            border: 0.45mm solid #000;
            border-radius: 4mm;
            padding: 3mm;
            background: #fff;
          }
          .barcode-label {
            text-align: center;
            margin-bottom: 1.1mm;
          }
          .barcode {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 19px;
            letter-spacing: 3px;
            text-align: center;
            font-weight: 700;
          }
          .notes {
            min-height: 14mm;
          }
          .footer {
            margin-top: auto;
            padding-top: 2mm;
            border-top: 0.3mm dashed var(--line);
            display: flex;
            justify-content: space-between;
            gap: 2mm;
            font-size: 7.8px;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.8px;
          }
        </style>
      </head>
      <body>${labels}</body>
    </html>
  `;
}

export async function printShippingLabels(orders: Order[]) {
  if (orders.length === 0) return;

  const payload = await Promise.all(
    orders.map(async (order) => ({
      order,
      zone: await getZoneMetaForPostcode(order.empfaengerPlz),
      qrCodeDataUrl: await createQrCodeDataUrl(order),
    })),
  );

  const html = renderDocument(
    payload.map(({ order, zone, qrCodeDataUrl }) => renderSingleLabel(order, zone, qrCodeDataUrl)).join(""),
    orders.length === 1 ? `Versandetikett – ${orders[0].auftragsNr}` : `Etiketten (${orders.length})`,
  );

  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;

  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

export async function getOrderZoneMeta(order: Order) {
  return getZoneMetaForPostcode(order.empfaengerPlz);
}