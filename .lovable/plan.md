# Plan: Versandetiketten in Shopify bereitstellen

## Ziel
Sobald für eine Shopify-Bestellung ein Versandetikett (DHL **oder** e-cargo) erstellt wurde, bekommt der Händler in seiner Shopify-Order:
1. Eine **Order-Note** mit direktem Download-Link zum Label-PDF.
2. Ein **Fulfillment** mit Tracking-Nummer + Tracking-URL (wie heute, nur jetzt früher ausgelöst).

## Trigger ändern
Aktuell läuft `shopify-push-fulfillments` erst bei Status `unterwegs`/`zugestellt`. Neuer Trigger:
- Sobald `dhl_label_url` gesetzt wird (DHL-Fall) **oder**
- sobald für eine e-cargo-Order ein Etikett gedruckt wurde (wir nutzen hier `tracking_token`, das ohnehin existiert, und triggern beim ersten Aufruf von „Etikett drucken" für Shopify-Orders).

Auswahl-Query in der Edge-Function wird erweitert auf:
```
shop_connection_id IS NOT NULL
AND external_order_ref IS NOT NULL
AND shopify_fulfilled_at IS NULL
AND (dhl_label_url IS NOT NULL OR status IN ('in_bearbeitung','unterwegs','zugestellt'))
```

## Edge Function: `shopify-push-fulfillments` erweitern

### 1. Label-URL ermitteln
- DHL-Order: `dhl_label_url` ist bereits ein Pfad im `delivery-notes` Bucket. Wir erzeugen eine **signed URL** (7 Tage Gültigkeit) via `admin.storage.from('delivery-notes').createSignedUrl(path, 60*60*24*7)`.
- e-cargo-Order (kein DHL): Link zur eigenen Tracking-/Label-Seite. Da unser Label clientseitig gedruckt wird, hinterlegen wir die Tracking-URL (`buildTrackingUrl(...)`) — der Händler kann das e-cargo-Label im Portal ausdrucken. (Optional Folge-Iteration: Label serverseitig rendern und in Storage ablegen.)

### 2. Order-Note in Shopify schreiben
Vor dem Fulfillment-Call ein PUT auf `/orders/{id}.json`:
```json
{ "order": { "id": ..., "note": "Versandetikett (e-cargo): <signed_url>\nTracking: <tracking_url>" } }
```
- Wenn bereits eine Note existiert, **anhängen** statt überschreiben (vorher `GET /orders/{id}.json?fields=note` lesen, neuen Block per Trennlinie ergänzen, idempotent über Marker `[e-cargo-label]`).

### 3. Fulfillment unverändert
Tracking-Info wie heute. `notify_customer` bleibt `true` (DHL-Sonderfall: für DHL-Orders bereits in `orderEmail.ts` unterdrückt — Shopify-seitige Customer-Mail ist davon unabhängig; falls auch hier unterdrückt werden soll, `notify_customer: false` setzen — siehe offene Frage unten).

### 4. Idempotenz
- `shopify_fulfilled_at` markiert Push als erledigt (bereits vorhanden).
- Neuer Spalten-Marker nicht nötig — Note-Block wird über Marker-String idempotent.

## Auslöser

### A. DHL-Label
In `create-dhl-label/index.ts`: nach erfolgreichem Speichern von `dhl_label_url` zusätzlich `supabase.functions.invoke('shopify-push-fulfillments', { body: { orderId } })` (fire-and-forget).

### B. e-cargo Label-Druck
In `src/lib/shippingLabels.ts` → `printShippingLabels`: für jede Order mit `shop_connection_id` + `external_order_ref` einmalig die Edge-Function triggern (oder serverseitig: separater Button „An Shopify melden" — fragt offene Frage 2).

### C. Cron bleibt
15-Min-Cron als Fallback (deckt Edge-Cases ab, in denen der Direkt-Trigger fehlschlug).

## Anzeige im Frontend
`OnlineShopPage.tsx` (Händler-Sicht) bekommt pro Order zusätzlich:
- Badge „An Shopify gemeldet" (grün) wenn `shopify_fulfilled_at` gesetzt.
- Sonst: „Wartet auf Etikett".

## Offene Fragen
1. Bei **DHL-Orders** soll laut Memo *keine* Kundenbenachrichtigung von e-cargo rausgehen. Soll auch Shopify den Kunden **nicht** automatisch per Mail über das Fulfillment informieren (`notify_customer: false`)?
2. Soll der e-cargo-Label-Push **automatisch** beim Drucken passieren oder nur über einen separaten Button im Auftragsdetail?

## Geänderte Dateien (Vorschau)
- `supabase/functions/shopify-push-fulfillments/index.ts` — Query, Note-Update, Signed-URL
- `supabase/functions/create-dhl-label/index.ts` — Direkt-Trigger nach Label
- `src/lib/shippingLabels.ts` oder `OrderDetailSheet.tsx` — e-cargo Trigger (abhängig von Frage 2)
- `src/pages/OnlineShopPage.tsx` — Status-Badge
