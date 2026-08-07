---
name: Shop Integrations
description: External shop APIs (Shopify) — admin-managed connection, sync, and label push-back
type: feature
---
- Shopify-Verbindung wird **ausschließlich vom Admin** in der Händlerverwaltung gepflegt.
- **Import-Regelweg seit 08/2026: Webhook `orders/fulfilled` → `shopify-order-webhook`.**
  - HMAC-Prüfung gegen `shop_connections.webhook_secret` (Shopify App-Secret), fail closed.
  - Cutoff `shop_connections.webhook_cutoff_at` (wird bei Aktivierung auf now() gesetzt) verhindert Alt-Bestand/Replays.
  - Online vs. Vor-Ort: Blacklist `shop_connections.pos_source_names` (Default `pos`,`shopify_pos`) **plus** Pflicht-`shipping_address`. `web` und `shopify_draft_order` werden importiert.
  - Übertragung erfolgt über die REST-API `wms-create-shipment` (Header `x-wms-api-key`, globaler `WMS_API_KEY`, `merchant_reference` = Händlercode) – kein direkter DB-Insert.
  - Idempotenz über `orders (shop_connection_id, external_order_ref)` (Unique-Index) + `external_source_ref` `shopify:<connId>:<orderId>`.
  - Protokoll aller Entscheidungen in `shopify_webhook_log` (imported/discarded/duplicate/error, admin-only).
  - Fehler der Zielsysteme → HTTP 500, Shopify wiederholt mit eigenem Backoff (bis 48 h).
  - Aktivierung über Admin → Händler → Shop-Anbindung → „Webhook aktivieren" (`shopify-webhook-setup`).
- Legacy-Poll `shopify-sync` (unshipped orders) ist **abgeschaltet**: Cron entfernt, läuft nur noch bei `poll_sync_enabled = true` bzw. manuellem Trigger mit `connectionId`.
- Filter: Nur Bestellungen mit PLZ in unserem Liefergebiet werden importiert.
- Push-Back an Shopify (`shopify-push-fulfillments`) sobald ein Etikett erstellt wurde:
  - DHL: direkt nach `create-dhl-label`.
  - e-cargo: nach `printShippingLabels` (Client fire-and-forget).
  - Cron als Fallback (Orders mit `dhl_label_url` oder Status `in_bearbeitung`/`unterwegs`/`zugestellt`).
- Push macht zwei Dinge:
  1. **Order-Note** in Shopify ergänzt mit Label-Link (DHL: signed URL aus `delivery-notes` Bucket, e-cargo: Tracking-URL). Idempotent über Marker `[e-cargo-label]`.
  2. **Fulfillment** mit Tracking-Nummer + Tracking-URL. `notify_customer = false` für DHL (konsistent mit unterdrückter e-cargo Mail), sonst `true`.
- Kein Webhook-Flow.
