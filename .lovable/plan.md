## Ziel

Deine selbstgebaute Warenwirtschaft (Fulfillment-Tool) soll nach dem Verpacken eine Bestellung per HTTP an e-cargo schicken und synchron eine Sendungsnummer + Tracking-URL + Etikett zurückbekommen — analog zum bisherigen Track-Pod Flow.

## Was gebaut wird

### 1. Neue Edge Function `external-create-order`
Öffentlich erreichbar (`verify_jwt = false`), Auth über eigenen API-Key im Header `X-API-Key`.

- **Endpoint:** `POST https://quvxpnftdwwvhcdvuegw.functions.supabase.co/external-create-order`
- **Auth:** `X-API-Key: ec_live_xxxxxxxxxxxx` (pro Händler)
- **Body (minimal):**
  ```json
  {
    "external_ref": "shopify-1234",
    "empfaenger_name": "Max Mustermann",
    "empfaenger_strasse": "Rauendahlstraße 59",
    "empfaenger_plz": "44797",
    "empfaenger_stadt": "Bochum",
    "empfaenger_email": "max@example.com",
    "empfaenger_telefon": "+49 ...",
    "pakete": 1
  }
  ```
- **Response 200:**
  ```json
  {
    "order_id": "uuid",
    "auftrags_nr": "EC-XXX-0000123",
    "tracking_url": "https://.../track/<token>",
    "label_pdf_url": "https://.../label.pdf",
    "status": "neu"
  }
  ```
- Validierung (zod), Idempotenz über `external_ref` (gleicher Key → gleiche Bestellung zurück, keine Dublette), automatisches Geocoding wie im Admin-Flow, automatischer E-Mail-Trigger `order-neu`.

### 2. Neue Tabelle `merchant_api_keys`
| Spalte | Zweck |
|---|---|
| user_id | Händler (Mandant) |
| key_hash | sha256 vom Token (Klartext wird nur 1× beim Erstellen angezeigt) |
| label | "Warenwirtschaft Lager" |
| last_used_at, revoked_at | Monitoring |

Mit RLS + GRANTs. Admins und Händler sehen nur ihre eigenen Keys.

### 3. Admin/Händler UI
- Im Händler-Detail (`HaendlerDetailPage`) neuer Tab/Card **„API-Zugang"**:
  - Button „Neuen API-Key erstellen" → zeigt Klartext genau einmal an, Copy-Button
  - Liste bestehender Keys mit Label, Erstelldatum, letzte Nutzung, „Widerrufen"
- Edge Function `admin-create-merchant-api-key` zum sicheren Generieren (`ec_live_` + 32 random bytes hex).

### 4. Etikett-PDF
Sync-Response liefert eine signierte URL aus dem `delivery-notes` Bucket. Etikett wird in der Function direkt nach dem Insert generiert (Wiederverwendung der bestehenden `printShippingLabels`-Logik als reine Render-Funktion, in PDF gegossen via existing PDF-Utility).

### 5. Doku
Kleine `README.md` im Function-Ordner mit `curl`-Beispiel für dein WaWi-Team — du kannst die Snippets direkt in deine Flask-`fulfillment_workflow.html` Route einbauen (Step „Versenden" → POST an e-cargo statt Track-Pod).

## Was NICHT gebaut wird (außerhalb Scope)
- Änderungen an deiner Flask-WaWi selbst (du machst den Request-Aufruf dort, ich liefere dir das Snippet).
- Webhooks zurück (Status-Updates von e-cargo → WaWi). Können wir später ergänzen, sag Bescheid.
- Artikel-/SKU-Übertragung (laut deiner Antwort nicht nötig).

## Technische Details
- `external-create-order` läuft mit `SERVICE_ROLE_KEY` intern, ordnet die Bestellung über den API-Key dem korrekten `user_id` zu → Mandantentrennung sauber.
- `external_ref` wird als unique-Index `(user_id, external_ref)` partial-indexed gespeichert (Idempotenz).
- Rate-Limit: simples in-memory throttle (60 req/min/key) — bei Bedarf später härter.
- CORS offen, da Server-to-Server (keine Browser-Calls erwartet).
