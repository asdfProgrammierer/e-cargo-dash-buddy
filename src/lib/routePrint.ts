import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type jsPDFType from "jspdf";

export interface RoutePrintData {
  id: string;
  name: string;
  datum: string;
  start_time?: string | null;
  drivers?: { name: string } | null;
  vehicles?: { kennzeichen: string } | null;
}

/**
 * Erzeugt die bekannte Route-Druckansicht: ein PDF mit allen Stops in
 * Reihenfolge (Nr, Empfänger, Adresse, Händler, Telefon, Pakete) und
 * anklickbaren Checkboxen. Der Druckdialog wird direkt geöffnet.
 *
 * Wird von der Routenplanung und von der Routen-Vollansicht genutzt,
 * damit beide exakt denselben Druck erzeugen.
 */
export async function generateRoutePrintPdf(route: RoutePrintData): Promise<void> {
  const { data: stops, error } = await supabase
    .from("route_stops")
    .select(
      "position, notiz, orders(user_id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_telefon, pakete, notizen)",
    )
    .eq("route_id", route.id)
    .order("position", { ascending: true });
  if (error) throw error;

  const userIds = Array.from(
    new Set((stops ?? []).map((s: any) => s.orders?.user_id).filter(Boolean)),
  );
  let merchantMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, firma_name, ansprechpartner")
      .in("user_id", userIds);
    (profs ?? []).forEach((p: any) => {
      merchantMap.set(p.user_id, p.firma_name || p.ansprechpartner || "–");
    });
  }

  const rows = (stops ?? []).map((s: any) => {
    const o = s.orders ?? {};
    const merchant = merchantMap.get(o.user_id) ?? "–";
    const addr = [o.empfaenger_adresse, [o.empfaenger_plz, o.empfaenger_stadt].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    return [
      "", // checkbox column (drawn manually)
      String(s.position),
      o.empfaenger_name ?? "–",
      addr || "–",
      merchant,
      o.empfaenger_telefon ?? "",
      String(o.pakete ?? 1),
    ];
  });

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc: jsPDFType = new jsPDF({ unit: "mm", format: "a4" });
  const dateStr = new Date(route.datum).toLocaleDateString("de-DE");
  doc.setFontSize(16);
  doc.text(`Route: ${route.name}`, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(90);
  const meta = [
    `Datum: ${dateStr}`,
    `Start: ${route.start_time?.slice(0, 5) ?? "–"}`,
    `Fahrer: ${route.drivers?.name ?? "–"}`,
    `Fahrzeug: ${route.vehicles?.kennzeichen ?? "–"}`,
    `Stops: ${(stops ?? []).length}`,
  ].join("   ·   ");
  doc.text(meta, 14, 22);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 28,
    head: [["", "#", "Empfänger", "Adresse", "Händler", "Telefon", "Pakete"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2, valign: "middle" },
    headStyles: { fillColor: [34, 139, 87], halign: "center" },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 10, halign: "center" },
      2: { cellWidth: 36 },
      3: { cellWidth: 58 },
      4: { cellWidth: 36 },
      5: { cellWidth: 24 },
      6: { cellWidth: 14, halign: "center" },
    },
    // Draw an empty checkbox in the first column of each body row.
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const size = 4;
        const x = data.cell.x + (data.cell.width - size) / 2;
        const y = data.cell.y + (data.cell.height - size) / 2;
        doc.setDrawColor(80);
        doc.setLineWidth(0.35);
        doc.rect(x, y, size, size, "S");
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const page = data.pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `e-cargo · ${route.name} · ${dateStr} · Seite ${page}/${pageCount}`,
        14,
        doc.internal.pageSize.getHeight() - 8,
      );
      doc.setTextColor(0);
    },
  });

  // Print direkt auslösen statt PDF herunterzuladen
  doc.autoPrint();
  const blobUrl = doc.output("bloburl");
  const win = window.open(blobUrl, "_blank");
  if (!win) {
    toast.error("Popup blockiert – bitte Popups für diese Seite erlauben");
  } else {
    toast.success("Druckdialog wird geöffnet");
  }
}
