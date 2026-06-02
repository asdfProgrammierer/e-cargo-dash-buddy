## Ziel
Admins sollen zu jeder Bestellung dieselbe Auftrags-PDF herunterladen können, die Händler bereits aus ihrer Tabelle erzeugen.

## Umfang
- **Admin-Dashboard – Bestellungstabelle** (`src/pages/admin/AdminDashboardPage.tsx`):
  Neue Aktion "PDF" pro Zeile (Icon-Button `FileDown`, neben den bestehenden Buttons), ruft `downloadOrderPdf(order)` aus `src/lib/orderPdf.ts` auf. Loading-State je Zeile, Toast bei Fehler.
- **OrderDetailSheet** (`src/components/dashboard/OrderDetailSheet.tsx`):
  Im Footer/Header neben "Lieferschein drucken" einen Button "Auftrags-PDF" ergänzen. Sichtbar für alle (Händler profitieren ebenfalls), nutzt dieselbe Funktion.
- **ObstacleOrdersCard** (`src/components/admin/dashboard/ObstacleOrdersCard.tsx`):
  Kleiner PDF-Icon-Button je Eintrag.

## Technisch
- Keine neuen Libraries – `downloadOrderPdf` existiert bereits und nutzt jsPDF + QRCode clientseitig.
- Keine RLS-/Backend-Änderungen nötig: Admin liest Orders bereits, PDF wird clientseitig erzeugt.
- Kein neues Schema, keine Migration.

## Nicht enthalten
- Server-seitige PDF-Generierung / Bulk-Download
- Änderungen am PDF-Layout selbst