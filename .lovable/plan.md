# Warenwirtschaft an e-cargo connect anbinden (statt Track-POD)

## Ausgangslage

Die Schnittstelle existiert bereits vollständig: die Funktion `wms-create-shipment` nimmt fertig verpackte Sendungen entgegen, prüft Liefergebiet/PLZ, erzeugt die Sendungsnummer (EC-…), das Versandlabel und die Tracking-URL. Authentifizierung läuft über händlerspezifische API-Keys (`wms_live_…`), die an den Händlercode gebunden sind. Es muss also **kein neuer Code** gebaut werden — es geht um Einrichtung und Umbau der Warenwirtschaft.

## Schritt 1: Zugang einrichten (in e-cargo connect)

1. In der Admin-Händlerverwaltung beim betreffenden Händler einen Händlercode vergeben (falls noch nicht geschehen, z. B. `MAY`).
2. Im selben Händlerdatensatz unter „WMS-API-Zugang“ einen API-Key erzeugen und den einmalig angezeigten Klartext-Key sicher notieren (nur Hash wird gespeichert).
3. Lieferzonen/PLZ-Gebiet prüfen — Sendungen außerhalb werden fachlich abgelehnt (`OUT_OF_COVERAGE`).

## Schritt 2: Warenwirtschaft umbauen

Den bisherigen Track-POD-Versand durch einen HTTP-POST ersetzen:

- **Endpoint:** `https://<ecargo-connect-backend>/functions/v1/wms-create-shipment`
- **Header:** `Content-Type: application/json`, `x-wms-api-key: <Händler-Key>`
- **Body (Beispiel):**

```json
{
  "external_order_ref": "WMS-Bestellnr-12345",
  "recipient": {
    "name": "Max Mustermann",
    "street": "Musterstraße 1",
    "postal_code": "44135",
    "city": "Dortmund",
    "email": "optional@example.de",
    "phone": "optional"
  },
  "package": { "count": 2, "weight_kg": 3.5 }
}
```

- `external_order_ref` sorgt für Duplikat-Schutz (gleiche Referenz wird nicht doppelt angelegt).
- Der Händlercode muss **nicht** mitgeschickt werden — er steckt im API-Key.
- **Antwort:** `shipment_id`, `tracking_number` (EC-…), `tracking_url`, ggf. Label-PDF-URL.
- **Fehlerfälle sauber behandeln:** `UNAUTHORIZED` (falscher Key), `VALIDATION_ERROR` (Pflichtfelder), `OUT_OF_COVERAGE` (PLZ außerhalb Liefergebiet), `DUPLICATE_REFERENCE_CONFLICT` (bereits angelegt). Technische Fehler (5xx) mit Wiederholung/Backoff behandeln.

## Schritt 3: Test & Umstellung

1. Testsendung aus der Warenwirtschaft an den Endpoint schicken.
2. Prüfen: Auftrag erscheint beim Händler in e-cargo connect, Label abrufbar, Tracking-Link funktioniert.
3. Danach Track-POD-Versand in der Warenwirtschaft deaktivieren.

## Optionale Ergänzung (falls gewünscht)

- Ich lege eine fertige API-Spezifikation als Markdown-Dokument im Projekt ab (`wms-api-spezifikation.md`) zum Weitergeben — mit allen Feldern, Fehlercodes und Beispielen.
