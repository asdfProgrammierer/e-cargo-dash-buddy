## Ziel
Sobald der Fahrer eine Zustellung mit Unterschrift bestätigt, soll der Lieferschein automatisch als PDF neu generiert, mit der gespeicherten Signatur verknüpft und im Storage abgelegt werden – ohne dass jemand manuell auf "PDF herunterladen" klicken muss.

## Vorgehen

### 1. Storage-Bucket für Lieferscheine
- Neuen privaten Bucket `delivery-notes` anlegen.
- RLS-Policies analog zu `delivery-signatures`:
  - Admins: voller Zugriff
  - Fahrer: Lese-/Schreibzugriff auf Lieferscheine ihrer Routen-Stopps
  - Händler: Lesezugriff auf Lieferscheine ihrer eigenen Aufträge

### 2. Datenbank
- Spalte `delivery_note_pdf_url TEXT` zu `route_stops` hinzufügen (Pfad im Bucket).
- Migration über das Migration-Tool.

### 3. PDF-Generierung als wiederverwendbares Modul
- `src/lib/orderPdf.ts` refactoren: bestehende Logik in eine reine Funktion `buildOrderPdf(order): Promise<jsPDF>` extrahieren, die das `jsPDF`-Objekt zurückgibt.
- `downloadOrderPdf(order)` ruft `buildOrderPdf` + `doc.save()` auf (kein Verhaltensbruch für bestehende Aufrufer).
- Neue Funktion `buildOrderPdfBlob(order): Promise<Blob>` exportieren – wird vom Edge-Flow konsumiert.

### 4. Edge Function `driver-update-stop-status` erweitern
Direkt nach erfolgreichem Signatur-Upload + DB-Update:
- Auftrag laden (`orders` + `order_status_history` + `route_stops`).
- Lieferschein als PDF serverseitig erzeugen mit **jsPDF via esm.sh** (`https://esm.sh/jspdf@2.5.1` + `https://esm.sh/qrcode@1.5.3`). Dieselbe Layout-Logik wie im Frontend, gekapselt in einer geteilten Helper-Datei `supabase/functions/_shared/delivery-note-pdf.ts`.
  - Hinweis: Die Layout-Logik wird einmalig vom Frontend-Modul ins `_shared`-Modul portiert, damit Server + Client identische Lieferscheine erzeugen. (Frontend importiert weiterhin lokal, Server nutzt den geteilten Helper.)
- Signatur-PNG aus Storage laden und als Base64 ins PDF einbetten (`addImage`).
- PDF nach `delivery-notes/orders/<order_id>/<stop_id>-<timestamp>.pdf` hochladen (`upsert: true`).
- Pfad in `route_stops.delivery_note_pdf_url` speichern.
- Fehler beim PDF-Schritt nur loggen, **nicht** den gesamten Stopp-Update-Call fehlschlagen lassen (Zustellung muss erfasst bleiben, auch wenn PDF-Build hakt).

### 5. Frontend-Anpassung Lieferschein-Download
- `downloadOrderPdf` prüft zuerst `route_stops.delivery_note_pdf_url`. Wenn vorhanden → diese Datei aus dem Storage laden und herunterladen (so bekommen Händler/Admin exakt das PDF, das mit der Unterschrift archiviert wurde).
- Fallback: PDF wie bisher live generieren (für Aufträge ohne PoD).

### 6. Kein UI-Eingriff für den Fahrer
- Bestätigungs-Sheet bleibt unverändert. Nach erfolgreichem Submit zeigt der Toast zusätzlich „Lieferschein archiviert" an.

## Technische Details
- Edge-Function-Imports: `jspdf` und `qrcode` aus esm.sh (CDN, keine Build-Pipeline nötig in Deno).
- Service-Role-Client lädt Signatur via `storage.from('delivery-signatures').download(path)` → ArrayBuffer → Base64 für `addImage`.
- Upload als `Uint8Array` mit `contentType: 'application/pdf'`.
- Migration setzt nur die neue Spalte + Bucket + Policies; bestehende Daten unberührt.
- Types werden automatisch nach Migration aktualisiert.

## Ergebnis
Beim Tippen auf „Bestätigen" im Übergabe-Sheet wird die Unterschrift hochgeladen, der Stopp/Order auf „zugestellt" gesetzt **und** ein finaler Lieferschein als PDF mit eingebetteter Signatur im Backend abgelegt. Spätere PDF-Downloads liefern exakt diese archivierte Version.
