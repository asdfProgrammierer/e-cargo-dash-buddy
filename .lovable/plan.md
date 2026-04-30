# Wiederzustellung (2. & 3. Versuch)

## Ziel

Wenn ein Fahrer einen Stopp als „nicht zugestellt" markiert, soll die Bestellung automatisch:
1. Einen Zustellversuch hochzählen (max. 3).
2. Eine passende **Kunden-E-Mail** auslösen, die den nächsten Versuch ankündigt (oder bei Versuch 3 das endgültige Scheitern).
3. Bei Versuch 1 + 2 wieder als **„neu"** in die Routenplanung einfließen, damit sie unten im Bereich „Neue Sendungen" auftaucht und neu eingeplant werden kann.
4. Erst nach **3 erfolglosen Versuchen** dauerhaft auf `nicht_zugestellt` bleiben (Endzustand, Händler muss reagieren).

## Flow

```text
Versuch 1 fehlgeschlagen  -> delivery_attempts=1, status=neu, Mail "1. Zustellversuch fehlgeschlagen, 2. Versuch folgt kostenlos"
Versuch 2 fehlgeschlagen  -> delivery_attempts=2, status=neu, Mail "2. Zustellversuch fehlgeschlagen, 3. Versuch folgt kostenlos"
Versuch 3 fehlgeschlagen  -> delivery_attempts=3, status=nicht_zugestellt (final), Mail "Zustellung endgültig nicht möglich"
Versuch erfolgreich       -> status=zugestellt (Zähler bleibt zur Info)
```

## Datenmodell

- Spalte `orders.delivery_attempts integer not null default 0`.
- Konstante `MAX_DELIVERY_ATTEMPTS = 3` zentral in `src/types/order.ts`.

## Backend: `driver-update-stop-status`

Im Block, der bisher pauschal `newOrderStatus = "nicht_zugestellt"` setzt:

- Aktuellen `delivery_attempts` aus der DB lesen, `nextAttempt = current + 1`.
- Wenn `nextAttempt < 3`:
  - `orders.status = 'neu'`, `delivery_attempts = nextAttempt`, `delivered_at = null`.
  - History-Eintrag mit `reason` und Versuchsnummer.
  - Versand der neuen Vorlage `order-zustellversuch-fehlgeschlagen` mit `templateData.attemptNumber`, `nextAttemptNumber`, `reason`, `trackingUrl`.
- Wenn `nextAttempt >= 3`:
  - `orders.status = 'nicht_zugestellt'`, `delivery_attempts = 3` (final).
  - Bestehende Vorlage `order-nicht-zugestellt` versenden (final-Variante).
- Stopp selbst bleibt `uebersprungen` (bestehendes Verhalten); die Route wird wie bisher abgeschlossen, sobald keine `offen`en Stopps mehr vorhanden sind.

Damit die Order automatisch wieder in „Neue Sendungen" landet: `RoutenplanungPage.loadNewOrders` filtert bereits auf `status = 'neu'` — es ist also nichts an der Abfrage zu ändern. Über Realtime/Refresh erscheint die Bestellung von selbst wieder.

## E-Mail-Vorlagen

Neue gemeinsame Vorlage für Versuch 1 + 2:

- `supabase/functions/_shared/transactional-email-templates/order-zustellversuch-fehlgeschlagen.tsx`
  - Felder: `kundenname`, `auftragsNr`, `attemptNumber`, `nextAttemptNumber`, `reason`, `trackingUrl`, `haendlerName`, `lieferadresse`.
  - Kerntext: „Ihr {attemptNumber}. Zustellversuch war leider nicht erfolgreich. Wir versuchen es kostenlos erneut. Sie werden über den Status informiert, sobald ein neuer Termin feststeht."
- Eintrag in `registry.ts` ergänzen, Override-Defaults in `_override.ts` ergänzen, damit die Vorlage im Admin-Dashboard aktiv/inaktiv geschaltet und live bearbeitet werden kann.
- Bestehende `order-nicht-zugestellt` wird nur noch beim **finalen** Versuch verwendet — Text leicht anpassen ("nach 3 Versuchen").

`src/lib/orderEmail.ts` erhält den neuen Template-Key (für Test-Versand aus dem Admin-Dashboard) und versendet ihn analog zu den anderen Status-Mails.

## UI-Anpassungen (klein)

- `OrderDetailSheet` und Tracking-Page zeigen `delivery_attempts` als Badge („Versuch 2 von 3"), wenn > 0.
- `TrackingPage` zeigt bei `status=neu` mit `delivery_attempts > 0` einen Hinweis „Erneuter Zustellversuch in Planung".

## Migration

```sql
alter table public.orders
  add column if not exists delivery_attempts integer not null default 0;
```

Optional Index sparen — Anzahl ist klein.

## Edge Cases

- Idempotenz bleibt bestehen: nur erhöhen, wenn der Stopp gerade von `offen`/`erledigt` auf `uebersprungen` wechselt (`statusChanged`-Guard erweitern).
- `admin_update_order_status` (manuelles Setzen durch Admin auf `nicht_zugestellt`) zählt **nicht** automatisch hoch — das bleibt eine Admin-Override-Aktion.
- Bei manueller Stornierung greift die Logik nicht.

## Betroffene Dateien

- Migration: neue Spalte `delivery_attempts`.
- `supabase/functions/driver-update-stop-status/index.ts` — Versuchslogik + Mailauswahl.
- `supabase/functions/_shared/transactional-email-templates/order-zustellversuch-fehlgeschlagen.tsx` (neu).
- `supabase/functions/_shared/transactional-email-templates/registry.ts`, `_override.ts`, `order-nicht-zugestellt.tsx` (Text final).
- `src/lib/orderEmail.ts` — Template-Map erweitern.
- `src/types/order.ts` — `MAX_DELIVERY_ATTEMPTS`, Feld `deliveryAttempts`.
- `src/components/dashboard/OrderDetailSheet.tsx`, `src/pages/TrackingPage.tsx` — Anzeige Versuchszähler.
