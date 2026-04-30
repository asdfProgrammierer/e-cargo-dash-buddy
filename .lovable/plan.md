## Ziel
Automatisch generierte Abhol-Aufträge sollen für Admins in der Routenplanung wie normale Sendungen erscheinen — sichtbar in „Neue Sendungen", auf der Karte, und vor allem **einer Route zuweisbar**.

## Problem heute
Die Edge Function `generate-pickup-orders` erstellt zwar Aufträge mit `status='neu'`, **aber ohne Geokoordinaten** (`lat`/`lng` bleiben null). Die `NewOrdersTable` deaktiviert die Checkbox für Aufträge ohne Koordinaten — dadurch tauchen Abholungen zwar in der Liste auf, lassen sich aber nicht in eine Route hinzufügen und erscheinen auch nicht auf der Karte.

Zusätzlich ist die Adresse unsauber gefüllt: `empfaenger_adresse` enthält nur die Straße (statt der vollen Adresse), was die Geocodierung erschwert.

## Änderungen

### 1. Edge Function `generate-pickup-orders` erweitern
- Adresse korrekt zusammensetzen: `empfaenger_adresse = "{strasse}"`, `empfaenger_plz`, `empfaenger_stadt` (wie heute) — aber zusätzlich:
- **Direkt nach dem Insert geocodieren**: ORS Forward-Geocoding (gleicher Endpoint wie `geocode-address`, mit `ORS_API_KEY` aus Secrets) aufrufen und `lat`, `lng`, `geocoded_at` auf der neuen Order setzen.
- Falls Geocoding fehlschlägt → Order trotzdem behalten, aber im Result-Log vermerken (`geocode_failed`).

### 2. Admin-Sicht in `RoutenplanungPage.tsx`
- `loadNewOrders`-Query um `is_pickup` und `notizen` erweitern, an `NewOrdersTable` weiterreichen.

### 3. `NewOrdersTable.tsx`
- `NewOrderRow` Interface um `is_pickup?: boolean` ergänzen.
- In der Tabellenzeile neben der Auftrags-Nr. einen **gelben „Abholung"-Badge** anzeigen (gleicher Stil wie in `OrderTable.tsx`), damit Admins die Sendungen sofort erkennen.
- Funktional ändert sich nichts — sobald die Pickup-Orders Koordinaten haben, sind sie wie jede andere neue Sendung selektierbar, kartierbar und einer Route zuweisbar.

### 4. Optional: Fallback-Geocoding für Bestands-Abholungen
Einmaliger Re-Geocoding-Lauf der bereits ohne Koordinaten erstellten Pickup-Orders über die bestehende Logik — kann der Admin auch durch erneutes Triggern der Funktion (mit Cleanup) lösen, daher hier nicht zwingend nötig.

## Geänderte / neue Dateien
- `supabase/functions/generate-pickup-orders/index.ts` — Geocoding-Schritt nach Insert.
- `src/pages/admin/RoutenplanungPage.tsx` — `is_pickup` mitladen und durchreichen.
- `src/components/admin/NewOrdersTable.tsx` — Interface + Abholung-Badge in der Zeile.

## Ergebnis
Abhol-Aufträge erscheinen morgens automatisch in der Admin-Routenplanung mit klarem „Abholung"-Badge, sind auf der Karte sichtbar und können wie jede andere Sendung per Klick einer Tour zugeordnet werden.
