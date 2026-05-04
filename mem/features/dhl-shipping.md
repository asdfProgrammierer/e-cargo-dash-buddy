---
name: DHL Shipping Integration
description: Per-merchant DHL Parcel DE label creation when delivery PLZ is outside e-cargo coverage
type: feature
---
- Admin can toggle `profiles.dhl_enabled` per merchant in Händler-Detailansicht (Einstellungen-Tab).
- When enabled and an order's PLZ is outside the covered set, the edge function `create-dhl-label` is invoked automatically (auch bei CSV/Excel-Import).
- A manual "DHL-Label erzeugen" button is also available in the OrderDetailSheet.
- Uses DHL Parcel DE Shipping V2 REST API (api-eu.dhl.com), product V01PAK, **Produktion**.
- Secrets: `DHL_API_KEY`, `DHL_USERNAME`, `DHL_PASSWORD`, `DHL_BILLING_NUMBER`.
- `merchant_code` is sent as `costCenter` so DHL-Rechnungen pro Händler aufgesplittet werden können.
- Label PDF is stored in `delivery-notes` bucket as `dhl/<orderId>-<shipmentNo>.pdf` and order receives `dhl_label_url`, `dhl_tracking_number`, `dhl_shipment_no`, `dhl_label_created_at`.
