import { jsPDF } from "jspdf";
import { Order, STATUS_LABELS } from "@/types/order";

export function downloadOrderPdf(order: Order) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 15;
  let y = 20;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Auftragsdetails", marginX, y);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(order.auftragsNr, pageWidth - marginX, y, { align: "right" });
  y += 6;

  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Status: ${STATUS_LABELS[order.status]}`, marginX, y);
  doc.text(`Erstellt am: ${order.erstelltAm}`, pageWidth - marginX, y, { align: "right" });
  doc.setTextColor(0);
  y += 8;

  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 8;

  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, marginX, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  };

  const row = (label: string, value: string | number | undefined | null) => {
    if (value === undefined || value === null || value === "") return;
    const labelWidth = 45;
    doc.setTextColor(110);
    doc.text(label, marginX, y);
    doc.setTextColor(0);
    const text = String(value);
    const lines = doc.splitTextToSize(text, pageWidth - marginX * 2 - labelWidth);
    doc.text(lines, marginX + labelWidth, y);
    y += 5 * lines.length;
  };

  section("Absender");
  row("Name", order.absenderName);
  row("Adresse", order.absenderAdresse);
  y += 3;

  section("Empfänger");
  row("Name", order.empfaengerName);
  row("Adresse", order.empfaengerAdresse);
  row("PLZ / Stadt", `${order.empfaengerPlz ?? ""} ${order.empfaengerStadt}`.trim());
  if (order.empfaengerEmail) row("E-Mail", order.empfaengerEmail);
  if (order.empfaengerTelefon) row("Telefon", order.empfaengerTelefon);
  y += 3;

  section("Sendung");
  row("Pakete", order.pakete);
  row("Gewicht", `${order.gewicht} kg`);
  if (order.packageLengthCm || order.packageWidthCm || order.packageHeightCm) {
    row(
      "Maße (L×B×H)",
      `${order.packageLengthCm ?? 0} × ${order.packageWidthCm ?? 0} × ${order.packageHeightCm ?? 0} cm`,
    );
  }
  if (order.notizen) {
    y += 3;
    section("Notizen");
    row("", order.notizen);
  }

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Erstellt: ${new Date().toLocaleString("de-DE")}`,
    marginX,
    doc.internal.pageSize.getHeight() - 10,
  );

  doc.save(`auftrag-${order.auftragsNr}.pdf`);
}