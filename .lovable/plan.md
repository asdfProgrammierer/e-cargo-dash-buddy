# E-Mail-Benachrichtigungen für Endkunden

Endkunden mit hinterlegter E-Mail erhalten automatisch Updates zu ihrer Bestellung, abhängig vom Status. Versand erfolgt über die in Lovable integrierte E-Mail-Infrastruktur (eigene Domain, kein externer Dienst nötig).

## Voraussetzung: Sender-Domain einrichten

Aktuell ist noch keine Absender-Domain konfiguriert. Damit E-Mails von einer e-cargo-Adresse (z. B. `versand@deinedomain.de`) statt einer generischen Adresse versendet werden, ist als erster Schritt die einmalige Einrichtung der Domain nötig. Danach läuft alles automatisch.

## Welche E-Mails werden versendet?

Versand nur, wenn `empfaenger_email` gesetzt ist. Auslöser ist jede Statusänderung durch den Admin.

| Status | Betreff | Inhalt (Kurzform) |
|---|---|---|
| **neu** | Bestellung bei [Händler] erhalten | "Guten Tag [Name], Ihre Bestellung bei [Händler] wurde an uns übermittelt und wir liefern sie umweltfreundlich per Lastenrad an Sie aus." |
| **in_bearbeitung** | Ihre Bestellung wird vorbereitet | "Guten Tag [Name], Ihre Bestellung von [Händler] wird vorbereitet und in Kürze auf den Weg gebracht." + Bestellnummer + Tracking-Hinweis |
| **unterwegs** | Ihre Bestellung ist unterwegs | "Guten Tag [Name], unser Fahrer ist mit Ihrer Bestellung von [Händler] unterwegs zu Ihnen. Voraussichtliche Zustellung heute." |
| **zugestellt** | Ihre Bestellung wurde zugestellt | "Guten Tag [Name], Ihre Bestellung von [Händler] wurde erfolgreich zugestellt. Vielen Dank, dass Sie sich für eine umweltfreundliche Lieferung entschieden haben." + CO₂-Hinweis |
| **nicht_zugestellt** | Zustellung nicht möglich | "Guten Tag [Name], leider konnten wir Ihre Bestellung von [Händler] heute nicht zustellen. Grund: [reason]. Wir versuchen es erneut." |
| **storniert** | _kein E-Mail-Versand_ (Händler-/Adminentscheidung, Endkunde wird ggf. vom Händler informiert) | – |

Alle E-Mails enthalten:
- Bestellnummer (EC-XXX-0000001)
- Händlername (aus `profiles.firma_name`)
- Lieferadresse zur Bestätigung
- e-cargo Branding (grün, Sage/Emerald), kein Werbeanteil
- System-Footer mit Abmelde-Link (automatisch angehängt)

## Technische Umsetzung

1. **Domain & Infrastruktur einrichten**
   - Setup-Dialog für Sender-Domain
   - E-Mail-Queue, Log-Tabelle, Cron-Job, Suppression-Liste werden automatisch angelegt
   - Edge Function `send-transactional-email` und Unsubscribe-Seite werden gescaffoldet

2. **6 React-Email-Templates** (im e-cargo Look) für die fünf versendeten Status:
   - `order-neu`, `order-in-bearbeitung`, `order-unterwegs`, `order-zugestellt`, `order-nicht-zugestellt`
   - Jedes Template bekommt Props: `kundenname`, `haendlerName`, `auftragsNr`, `lieferadresse`, optional `reason` (für nicht_zugestellt)

3. **Trigger beim Statuswechsel**
   - Im Admin-Dashboard (`AdminDashboardPage.tsx`, `handleUpdateStatus`) wird nach erfolgreichem `admin_update_order_status`-RPC-Aufruf zusätzlich `send-transactional-email` aufgerufen, sofern der Auftrag eine `empfaenger_email` hat
   - `idempotencyKey = order-status-{orderId}-{status}` verhindert doppelte Sends bei Klick-Spam
   - Händlername wird per Join aus `profiles` geladen (oder einmalig zusammen mit den Orders mitgeliefert)

4. **Optional sinnvoll (kann ich gleich mitmachen oder weglassen):**
   - Beim Anlegen einer neuen Bestellung (Händler erstellt Order) wird ebenfalls die "neu"-Mail ausgelöst, falls Endkunde-E-Mail vorhanden – also nicht nur beim Admin-Statuswechsel, sondern direkt beim Insert. Das deckt den Fall ab, dass eine Bestellung noch im Status "neu" beim Händler liegt.

## Reihenfolge der Schritte

1. Du klickst auf den "E-Mail-Domain einrichten"-Button (kommt nach Plan-Freigabe)
2. Du fügst die NS-Records bei deinem Domain-Anbieter hinzu (Anleitung wird angezeigt)
3. Während die DNS-Verifizierung läuft (kann bis zu 72 h dauern, meist <1 h), baue ich bereits Templates + Trigger-Logik – Versand startet automatisch sobald die Domain verifiziert ist
4. Test: Bestellung mit deiner eigenen E-Mail anlegen, Status durchklicken, E-Mails prüfen
