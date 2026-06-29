# external-create-order

Public REST endpoint für externe Warenwirtschaft / Fulfillment-Systeme.
Erstellt einen Auftrag in e-cargo und gibt synchron Sendungsnummer + Tracking-URL zurück.

## Endpoint

```
POST https://quvxpnftdwwvhcdvuegw.functions.supabase.co/external-create-order
```

## Authentifizierung

Header: `X-API-Key: ec_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

Den Key erstellt der e-cargo Admin pro Händler unter:
`Händler → Detailansicht → Tab "Shop-Anbindung" → "API-Zugang (Warenwirtschaft)"`.
Der Klartext wird genau einmal angezeigt — danach nur noch der Prefix.

## Request-Body

```json
{
  "external_ref": "shopify-order-1234",
  "empfaenger_name": "Max Mustermann",
  "empfaenger_strasse": "Rauendahlstraße 59",
  "empfaenger_plz": "44797",
  "empfaenger_stadt": "Bochum",
  "empfaenger_email": "max@example.com",
  "empfaenger_telefon": "+49 234 1234567",
  "pakete": 1,
  "gewicht": 1.2,
  "notizen": "Klingel kaputt — bitte anrufen"
}
```

- `external_ref` (optional, empfohlen) macht den Call **idempotent**: derselbe Wert
  pro Händler liefert immer denselben Auftrag zurück, kein Duplikat.
- Pflicht: `empfaenger_name`, `empfaenger_stadt`.

## Response 201 / 200

```json
{
  "order_id": "uuid",
  "auftrags_nr": "EC-XXX-0000123",
  "tracking_url": "https://ecargo-connect.ecargo-logistik.de/track/<token>",
  "label_url":   "https://ecargo-connect.ecargo-logistik.de/track/<token>",
  "status": "neu"
}
```

Bei Idempotenz-Treffer zusätzlich: `"idempotent": true` (HTTP 200).

## Fehler

| Status | Bedeutung |
|--------|-----------|
| 400    | Body invalid / Pflichtfeld fehlt |
| 401    | X-API-Key fehlt, ungültig oder widerrufen |
| 405    | Methode nicht POST |
| 409    | Händler hat keinen merchant_code |
| 500    | Serverfehler |

## Curl Beispiel

```bash
curl -X POST \
  https://quvxpnftdwwvhcdvuegw.functions.supabase.co/external-create-order \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ec_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  -d '{
    "external_ref": "wawi-9001",
    "empfaenger_name": "Max Mustermann",
    "empfaenger_strasse": "Rauendahlstraße 59",
    "empfaenger_plz": "44797",
    "empfaenger_stadt": "Bochum",
    "empfaenger_email": "max@example.com",
    "pakete": 1
  }'
```

## Python (Flask Snippet für die WaWi)

```python
import os, requests

ECARGO_URL = "https://quvxpnftdwwvhcdvuegw.functions.supabase.co/external-create-order"
ECARGO_KEY = os.environ["ECARGO_API_KEY"]

def push_to_ecargo(order):
    r = requests.post(ECARGO_URL, timeout=30,
        headers={"X-API-Key": ECARGO_KEY, "Content-Type": "application/json"},
        json={
            "external_ref": f"shopify-{order.id}",
            "empfaenger_name": f"{order.customer.first_name} {order.customer.last_name}",
            "empfaenger_strasse": f"{order.shipping_address.address1} {order.shipping_address.address2 or ''}".strip(),
            "empfaenger_plz": order.shipping_address.zip,
            "empfaenger_stadt": order.shipping_address.city,
            "empfaenger_email": order.customer.email,
            "empfaenger_telefon": order.shipping_address.phone,
            "pakete": 1,
        })
    r.raise_for_status()
    return r.json()  # { order_id, auftrags_nr, tracking_url, label_url, status }
```