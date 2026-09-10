# e-cargo connect – WMS-API Integrations-Dokumentation (KI-fertig)

> Diese Dokumentation ist dafür gedacht, einer KI oder einem Entwickler als vollständige
> Grundlage für die Implementierung der Anbindung einer Warenwirtschaft (WMS) an
> e-cargo connect zu dienen. Sie enthält alles Nötige: Authentifizierung, Schemas,
> Antworten, Fehlercodes, Idempotenz-Verhalten und einen Implementierungs-Leitfaden.

---

## 1. Zweck

Wenn eine Bestellung im WMS **fertig verpackt** ist, sendet das WMS einen HTTP-POST
an e-cargo connect. e-cargo connect legt den Auftrag an, prüft das Liefergebiet,
erzeugt eine Sendungsverfolgungsnummer, ein Versandlabel (PDF, 100×150 mm) und einen
öffentlichen Tracking-Link. Alle drei Informationen kommen in der HTTP-Antwort zurück
und sollen im WMS zur Bestellung gespeichert werden.

---

## 2. Endpoint & Authentifizierung

```
POST https://quvxpnftdwwvhcdvuegw.supabase.co/functions/v1/wms-create-shipment
```

| Header | Wert |
|---|---|
| `Content-Type` | `application/json` |
| `x-wms-api-key` | Händlerspezifischer API-Key, beginnt mit `wms_live_…` |

**Wichtig zur Authentifizierung:**
- Der API-Key wird in e-cargo connect in der Admin-Händlerverwaltung erzeugt und ist
  **fest an genau einen Händler (Händlercode) gebunden**. Der Händlercode muss daher
  im Request **nicht** mitgeschickt werden.
- Der Key wird nur **einmalig im Klartext** angezeigt. Es wird nur ein SHA-256-Hash
  gespeichert; ein verlorener Key kann nicht wiederhergestellt, sondern muss neu
  erzeugt werden.
- Keys können deaktiviert werden → dann liefert die API `401 UNAUTHORIZED`.

---

## 3. Request-Body (JSON-Schema)

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
  "notes": "Optionaler Hinweis für die Zustellung",
  "merchant_reference": "MAY"
}
```

### Felddefinitionen

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `external_order_ref` | string (max. 128) | **Ja** | Eindeutige Bestellreferenz aus dem WMS. Dient als Duplikat-Schutz (Idempotenz-Key). |
| `recipient.name` | string | **Ja** | Name des Empfängers |
| `recipient.street` | string | **Ja** | Straße + Hausnummer |
| `recipient.postal_code` | string | **Ja** | Genau 5-stellige deutsche PLZ |
| `recipient.city` | string | **Ja** | Ort |
| `recipient.country` | string | Nein | Standard: `DE` |
| `recipient.email` | string | Nein | Empfänger erhält Status-E-Mails (Zustellung etc.) |
| `recipient.phone` | string | Nein | Wird auf dem Label gedruckt, wenn vorhanden |
| `sender.*` | Objekt | Nein | Absender-Override. Fehlt er, werden die in e-cargo connect hinterlegten Händlerdaten verwendet. **Empfehlung: weglassen.** |
| `package.count` | integer | **Ja** | Anzahl Pakete, 1–99 |
| `package.weight_kg` | number | **Ja** | Gesamtgewicht in kg, 0–1000 (Komma oder Punkt akzeptiert) |
| `package.length_cm` | number | Nein | Paketmaße |
| `package.width_cm` | number | Nein | Paketmaße |
| `package.height_cm` | number | Nein | Paketmaße |
| `notes` | string | Nein | Zustellhinweis für den Fahrer |
| `merchant_reference` | string (3 Zeichen) | Nein | 3-stelliger Händlercode. Bei händlerspezifischem Key **nicht nötig**; falls mitgeschickt, muss er zum Key passen, sonst Fehler. **Empfehlung: weglassen.** |

---

## 4. Erfolgsantwort (HTTP 201)

```json
{
  "shipment_id": "6f1c8a2e-…",
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

### Was das WMS mit der Antwort tun soll

| Feld | Verwendung im WMS |
|---|---|
| `tracking_number` | Zur Bestellung speichern (Sendungsverfolgungsnummer, Format `EC-<CODE>-<7-stellig>`). Kann z. B. an Shop/Kunde übertragen werden. |
| `tracking_url` | Öffentlicher Tracking-Link für den Endkunden (z. B. in Versand-E-Mail). |
| `label.pdf_base64` | Versandetikett (100×150 mm) als Base64-kodiertes PDF → direkt speichern und/oder auf dem Etikettendrucker ausgeben. |
| `label.download_url` | Alternativ: signierter Download-Link, **24 Stunden gültig**. Nicht als Dauer-Speicher nutzen. |
| `shipment_id` | Interne ID, optional für Support-Zwecke speichern. |

---

## 5. Idempotenz (Duplikat-Schutz)

- Derselbe `external_order_ref` mit **identischen Daten** erneut gesendet → die API
  liefert die **bestehende Sendung** zurück (kein Duplikat, kein Fehler).
- Derselbe `external_order_ref` mit **geänderten Daten** → `409 DUPLICATE_REFERENCE_CONFLICT`.
- **Konsequenz für das WMS:** Bei Timeouts/Netzwerkfehlern darf derselbe Request
  bedenkenlos wiederholt werden.

---

## 6. Fehlercodes

Fehler kommen als JSON:
```json
{ "error": { "code": "…", "message": "…", "details": { } } }
```

| HTTP | Code | Bedeutung | Empfohlenes Verhalten im WMS |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Pflichtfeld fehlt/ungültig (`details` nennt die Felder) | Daten prüfen, **nicht** automatisch wiederholen |
| 400 | `UNKNOWN_MERCHANT` | Händlercode unbekannt oder Händler nicht freigegeben | Einrichtung prüfen |
| 401 | `UNAUTHORIZED` | API-Key fehlt, ist ungültig oder deaktiviert | Key prüfen, **nicht** wiederholen |
| 409 | `DUPLICATE_REFERENCE_CONFLICT` | Referenz existiert bereits mit anderen Daten | Referenz ändern oder Bestellung als „bereits übertragen" markieren |
| 422 | `OUT_OF_COVERAGE` | PLZ liegt außerhalb des Liefergebiets | Fachlich ablehnen (z. B. anderen Versanddienst wählen), **nicht** wiederholen |
| 500 | `LABEL_RENDER_FAILED` / `INTERNAL_ERROR` | Technischer Fehler | Mit Exponential-Backoff wiederholen (z. B. 1 min, 5 min, 15 min), danach Fehler anzeigen |

**Allgemeine Retry-Regel:** Nur 5xx und Netzwerk-Timeouts wiederholen. 4xx niemals
unverändert wiederholen.

---

## 7. Implementierungs-Leitfaden (für die KI im WMS)

1. **Konfiguration im WMS vorsehen:** API-Key (`wms_live_…`) und Endpoint-URL
   als Einstellungen speicherbar machen.
2. **Trigger:** Funktion beim Status „fertig verpackt" aufrufen.
3. **Request bauen:** `external_order_ref` = eindeutige, stabile WMS-Bestellnummer.
   `sender` und `merchant_reference` weglassen.
4. **Senden:** POST mit den Headern aus Abschnitt 2.
5. **Antwort verarbeiten:**
   - `tracking_number` + `tracking_url` zur Bestellung speichern.
   - `label.pdf_base64` decodieren, als PDF-Datei ablegen und/oder drucken.
6. **Fehlerbehandlung** nach Tabelle in Abschnitt 6 umsetzen.
7. **Doppelübertragung verhindern:** Bestellung nach HTTP 201 als „übertragen"
   markieren. Idempotenz der API ist zusätzliches Sicherheitsnetz.

### Pseudocode

```python
def ship_order(order):
    payload = {
        "external_order_ref": order.id,          # stabil & eindeutig
        "recipient": {
            "name": order.customer_name,
            "street": order.street,
            "postal_code": order.zip,
            "city": order.city,
            "email": order.email or None,
            "phone": order.phone or None,
        },
        "package": {
            "count": order.package_count,
            "weight_kg": order.weight_kg,
        },
    }
    resp = http_post(
        "https://quvxpnftdwwvhcdvuegw.supabase.co/functions/v1/wms-create-shipment",
        headers={"Content-Type": "application/json",
                 "x-wms-api-key": settings.ecargo_api_key},
        json=payload, timeout=30)

    if resp.status_code == 201:
        data = resp.json()
        order.tracking_number = data["tracking_number"]
        order.tracking_url = data["tracking_url"]
        save_pdf(data["label"]["pdf_base64"], order.id)   # base64 → Datei
        order.ecargo_status = "übertragen"
    elif resp.status_code == 422:
        order.ecargo_status = "außerhalb_liefergebiet"   # andere Versandart wählen
    elif resp.status_code in (400, 401, 409):
        order.ecargo_status = "fehler"
        log(resp.json())                                  # nicht wiederholen
    else:
        retry_later(order)                                # Backoff, siehe 6.
```

### curl-Test

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

---

## 8. Einrichtung (Kurzfassung für den Betreiber)

1. In e-cargo connect: **Admin → Händlerverwaltung → Händler auswählen**.
2. Händlercode vergeben (falls nicht vorhanden), z. B. `MAY`.
3. Unter **„WMS-API-Zugang"** einen API-Key erzeugen und sofort kopieren.
4. Key + Endpoint-URL im WMS hinterlegen.
5. Testsendung auslösen → Auftrag erscheint im Händler-Dashboard, Label kommt
   in der API-Antwort zurück.
