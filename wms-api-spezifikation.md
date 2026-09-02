# e-cargo connect – WMS-API-Spezifikation

Schnittstelle zur Anlage von Sendungen aus einer Warenwirtschaft (WMS).
Ersetzt den bisherigen Track-POD-Versand: Wenn eine Bestellung fertig verpackt ist,
sendet das WMS einen HTTP-POST an e-cargo connect und erhält Sendungsnummer,
Tracking-Link und Versandlabel (PDF) zurück.

---

## 1. Endpoint

```
POST https://quvxpnftdwwvhcdvuegw.supabase.co/functions/v1/wms-create-shipment
```

| Header | Wert |
|---|---|
| `Content-Type` | `application/json` |
| `x-wms-api-key` | Händlerspezifischer API-Key (`wms_live_…`) |

Der API-Key wird in e-cargo connect in der Händlerverwaltung erzeugt
(Admin → Händler → „WMS-API-Zugang") und ist fest an den Händlercode gebunden.
Er wird nur einmalig im Klartext angezeigt.

---

## 2. Request-Body

```json
{
  "external_order_ref": "WMS-Bestellnr-12345",
  "recipient": {
    "name": "Max Mustermann",
    "street": "Musterstraße 1",
    "postal_code": "44135",
    "city": "Dortmund",
    "country": "DE",
    "email": "kunde@example.de",
    "phone": "0151 23456789"
  },
  "sender": {
    "name": "Musterfirma GmbH",
    "street": "Lagerweg 5",
    "postal_code": "44139",
    "city": "Dortmund"
  },
  "package": {
    "count": 2,
    "weight_kg": 3.5,
    "length_cm": 40,
    "width_cm": 30,
    "height_cm": 20
  },
  "notes": "Optionaler Hinweis für die Zustellung"
}
```

### Felder

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `external_order_ref` | **Ja** | Eindeutige Referenz aus dem WMS (max. 128 Zeichen). Dient als Duplikat-Schutz. |
| `recipient.name` | **Ja** | Name des Empfängers |
| `recipient.street` | **Ja** | Straße + Hausnummer |
| `recipient.postal_code` | **Ja** | 5-stellige PLZ |
| `recipient.city` | **Ja** | Ort |
| `recipient.country` | Nein | Standard: `DE` |
| `recipient.email` | Nein | Für Status-E-Mails an den Empfänger |
| `recipient.phone` | Nein | Wird auf dem Label gedruckt, wenn vorhanden |
| `sender.*` | Nein | Absender-Override. Fehlt er, werden die hinterlegten Händlerdaten verwendet. |
| `package.count` | **Ja** | Anzahl Pakete (1–99) |
| `package.weight_kg` | **Ja** | Gesamtgewicht in kg (0–1000, Komma oder Punkt) |
| `package.length_cm / width_cm / height_cm` | Nein | Maße |
| `notes` | Nein | Zustellhinweis |
| `merchant_reference` | Nein | 3-stelliger Händlercode. Bei händlerspezifischem Key **nicht nötig**; falls mitgeschickt, muss er zum Key passen. |

---

## 3. Antwort (201 Created)

```json
{
  "shipment_id": "6f1c…",
  "tracking_number": "EC-MAY-0000042",
  "tracking_url": "https://ecargo-connect.ecargo-logistik.de/track/<token>",
  "zone_label": "Zentrum",
  "label": {
    "format": "pdf",
    "size": "100x150mm",
    "pdf_base64": "JVBERi0xLj…",
    "download_url": "https://…signierte-url…",
    "download_url_expires_at": "2026-09-03T11:30:00.000Z"
  },
  "created_at": "2026-09-02T11:30:00.000Z"
}
```

- `tracking_number` = Sendungsverfolgungsnummer (im WMS zur Bestellung speichern).
- `tracking_url` = öffentlicher Tracking-Link für den Empfänger.
- `label.pdf_base64` = das Etikett (100×150 mm) direkt als Base64 — kann sofort gedruckt/gespeichert werden.
- `label.download_url` = alternativ ein signierter Download-Link, 24 h gültig.

### Idempotenz

Wird derselbe `external_order_ref` mit **identischen Daten** erneut gesendet,
liefert die API die bestehende Sendung zurück (kein Duplikat).
Wird er mit **geänderten Daten** gesendet, antwortet sie mit
`409 DUPLICATE_REFERENCE_CONFLICT`.

---

## 4. Fehler

Fehler kommen als JSON: `{ "error": { "code": "…", "message": "…", "details": {…} } }`

| HTTP | Code | Bedeutung | Verhalten im WMS |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Pflichtfeld fehlt/ungültig (`details` nennt die Felder) | Daten prüfen, nicht wiederholen |
| 400 | `UNKNOWN_MERCHANT` | Händlercode unbekannt oder Händler nicht freigegeben | Einrichtung prüfen |
| 401 | `UNAUTHORIZED` | API-Key fehlt/ungültig/deaktiviert | Key prüfen, nicht wiederholen |
| 409 | `DUPLICATE_REFERENCE_CONFLICT` | Referenz existiert mit anderen Daten | Referenz ändern |
| 422 | `OUT_OF_COVERAGE` | PLZ außerhalb des Liefergebiets | Fachlich ablehnen, nicht wiederholen |
| 500 | `LABEL_RENDER_FAILED` / `INTERNAL_ERROR` | Technischer Fehler | Mit Backoff wiederholen (z. B. 1 min, 5 min, 15 min) |

---

## 5. Beispiel mit curl

```bash
curl -X POST "https://quvxpnftdwwvhcdvuegw.supabase.co/functions/v1/wms-create-shipment" \
  -H "Content-Type: application/json" \
  -H "x-wms-api-key: wms_live_XXXX" \
  -d '{
    "external_order_ref": "BEST-2026-0001",
    "recipient": {
      "name": "Max Mustermann",
      "street": "Musterstraße 1",
      "postal_code": "44135",
      "city": "Dortmund"
    },
    "package": { "count": 1, "weight_kg": 2.0 }
  }'
```

## 6. Einrichtung (Kurzfassung)

1. In e-cargo connect: Admin → Händlerverwaltung → Händler auswählen.
2. Händlercode vergeben (falls nicht vorhanden).
3. Unter „WMS-API-Zugang“ einen API-Key erzeugen und sofort kopieren.
4. Key + Endpoint-URL im WMS hinterlegen (statt Track-POD).
5. Testsendung auslösen → Auftrag erscheint im Händler-Dashboard, Label kommt in der Antwort.
