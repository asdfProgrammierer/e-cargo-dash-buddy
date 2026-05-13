---
name: Shop Integrations
description: External shop APIs (Shopify) — admin-managed connection, sync, and label push-back
type: feature
---
- Shopify-Verbindung wird **ausschließlich vom Admin** in der Händlerverwaltung gepflegt.
- Sync alle 15 Min via Cron (`shopify-sync`); Händler kann zusätzlich manuell triggern auf `/online-shop`.
- Filter: Nur Bestellungen mit PLZ in unserem Liefergebiet werden importiert.
- Push-Back an Shopify (`shopify-push-fulfillments`) sobald ein Etikett erstellt wurde:
  - DHL: direkt nach `create-dhl-label`.
  - e-cargo: nach `printShippingLabels` (Client fire-and-forget).
  - Cron als Fallback (Orders mit `dhl_label_url` oder Status `in_bearbeitung`/`unterwegs`/`zugestellt`).
- Push macht zwei Dinge:
  1. **Order-Note** in Shopify ergänzt mit Label-Link (DHL: signed URL aus `delivery-notes` Bucket, e-cargo: Tracking-URL). Idempotent über Marker `[e-cargo-label]`.
  2. **Fulfillment** mit Tracking-Nummer + Tracking-URL. `notify_customer = false` für DHL (konsistent mit unterdrückter e-cargo Mail), sonst `true`.
- Kein Webhook-Flow.
