# PDF-Verbesserung: Auftragsdokument + Lieferschein

## Ziel
Das PDF in `src/lib/orderPdf.ts` so erweitern, dass es alle wichtigen Auftragsinformationen für den Händler enthält und am Ende einen abtrennbaren Lieferschein zur Übergabe / Quittierung enthält.

## Inhalt des neuen PDFs (mehrseitig, A4)

### Seite 1 – Auftragsübersicht
- **Briefkopf**: e-cargo Logo (Text), Tagline „Wir liefern 100% elektrisch.", Dokumenttitel „Auftrag / Lieferschein", Auftrags-Nr. groß, Erstelldatum, aktueller Status als farbiger Badge.
- **Zwei-Spalten-Block**: Absender (links) und Empfänger (rechts) mit Name, Adresse, PLZ/Stadt, E-Mail, Telefon.
- **Sendungsdetails**-Tabelle: Pakete, Gewicht (kg), Maße L×B×H (cm), berechnetes Volumen, geschätzter CO₂-Wert (0,5 kg / Paket – konsistent mit Dashboard-Memory).
- **Hinweise / Notizen**-Block (falls vorhanden).
- **QR-Code** mit Auftrags-Nr. + Empfängerdaten oben rechts (gleiche Logik wie Versandetiketten via `qrcode`-Lib, bereits im Projekt).
- **Statushistorie**-Tabelle: Datum/Uhrzeit, Status, Grund. Wird aus `order_status_history` über Supabase geladen (analog zum AdminDashboardPage-Pattern). Falls keine Historie vorhanden → „Keine Statusänderungen protokolliert".

### Seite 2 – Lieferschein (abtrennbar)
- Schnittlinie oben („✂ Bitte hier abtrennen – Lieferschein").
- Kompakter Wiederholungs-Header: Auftrags-Nr., Datum, QR-Code.
- **Empfänger** prominent.
- **Sendungsinhalt**: Pakete, Gewicht, Maße.
- **Quittierungsfeld**:
  - Zeile „Übernommen am: __________ Uhrzeit: ______"
  - Zeile „Name in Druckbuchstaben: ____________________"
  - Größeres Unterschriftenfeld mit Rahmen + Label „Unterschrift Empfänger"
  - Checkbox-Kästchen: ☐ Persönlich übergeben ☐ An Nachbarn ☐ Ablageort: ______
- **Bemerkungen Fahrer** (leeres Linienfeld, ~4 Zeilen).
- Footer mit Auftrags-Nr. + Seitenzahl.

## Technische Umsetzung

### `src/lib/orderPdf.ts`
- Funktion async machen: `export async function downloadOrderPdf(order: Order)`.
- Neue Helfer:
  - `loadStatusHistory(orderId)` – Supabase-Query auf `order_status_history` (select id, status, reason, created_at, sortiert asc). Bei Fehler/leer → leeres Array.
  - `generateQrDataUrl(order)` – via `qrcode` Bibliothek (Wiederverwendung wie in `shippingLabels.ts`).
  - `drawHeader(doc, order)`, `drawAddresses(doc, order)`, `drawShipmentTable(doc, order)`, `drawHistory(doc, history)`, `drawDeliveryNote(doc, order, qr)` – modulare Blöcke mit klarer Y-Verwaltung.
- jsPDF-Features: `addImage` für QR-Code (PNG dataURL), `roundedRect`/`rect` für Felder, `setFillColor` für Status-Badge-Hintergrund, `setLineDashPattern` für Schnittlinie, `addPage()` für den Lieferschein.
- Statusfarben aus einer kleinen Map im PDF-Modul (RGB), passend zur App-Semantik (neu=blau, in_bearbeitung=orange, unterwegs=primary, zugestellt=grün, nicht_zugestellt=rot, storniert=grau).
- Datumsformatierung über `toLocaleString('de-DE')`.
- Footer auf jeder Seite (Auftrags-Nr. links, „Seite x / y" rechts) per `getNumberOfPages()`-Loop am Ende.

### Aufrufer anpassen
- `src/components/dashboard/OrderTable.tsx` (`downloadPdf`): `await downloadOrderPdf(order)` (Funktion ist nun async).
- `src/components/dashboard/OrderDetailSheet.tsx`: gleicher async-Aufruf, falls dort ebenfalls verwendet (prüfen und anpassen).

### Abhängigkeiten
- `jspdf` – bereits installiert.
- `qrcode` – bereits installiert (verwendet in `shippingLabels.ts`).
- `@/integrations/supabase/client` – für Historie.

## Nicht enthalten
- Keine Änderungen an Datenmodell oder DB.
- Keine Änderung am Versandetikett (`shippingLabels.ts`).
- Kein Server-seitiges PDF – Generierung bleibt clientseitig.
