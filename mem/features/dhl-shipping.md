---
name: DHL Shipping Integration
description: Per-merchant DHL Parcel DE label creation when delivery PLZ is outside e-cargo coverage
type: feature
---
- Admin can toggle `profiles.dhl_enabled` per merchant in Händler-Detail (Einstellungen-Tab).
- When enabled and PLZ is outside coverage, edge function `create-dhl-label` is invoked automatically (manual + Import).
- Sender: **Haldenstraße 58, 44809 Bochum (DEU)**.
- Produkt wird **automatisch** gewählt nach Empfängerland + Gewicht:
  - DE: <2kg → V62KP (Kleinpaket), sonst V01PAK (Paket)
  - EU: <2kg → V66KPI (Warenpost Int.), sonst V54EPAK (Paket EU)
  - Welt: <2kg → V66KPI, sonst V53WPAK (Paket Int.)
- Abrechnungsnummern (EKP) liegen in Tabelle `dhl_products` (admin editierbar):
  V01PAK 63884302590102, V62KP 63884302596202, V53WPAK/V54EPAK 63884302595301,
  V66KPI 63884302596601, RETOURE 63884302590702.
- Preise in `dhl_price_tiers` als Gewichts-Staffeln: (product_code, user_id nullable, max_weight_kg, price_netto).
  Globale Defaults: user_id NULL. Händler-Override: ersetzt globale Staffeln für dieses Produkt komplett.
  Auswahl: niedrigste Staffel mit max_weight_kg ≥ Auftragsgewicht; sonst schwerste Staffel.
  V01PAK Default-Stufen 1/3/5/10/20/31,5 kg; Kleinpaket V62KP nur ≤1 kg + max 35,3×25×8 cm
  (sonst auto-Fallback auf V01PAK). Edge Function speichert `dhl_product_code` und `dhl_price_netto` am Order.
- Secrets: `DHL_API_KEY`, `DHL_USERNAME`, `DHL_PASSWORD` (CIG). `DHL_BILLING_NUMBER` wird nicht mehr verwendet.
- `merchant_code` wird als `costCenter` an DHL übermittelt → Rechnungen pro Händler aufsplittbar.
- Label-PDF in `delivery-notes` Bucket unter `dhl/<orderId>-<shipmentNo>.pdf`.
- Admin-Seite: `/admin/einstellungen/dhl` (globale Defaults). Händler-Detail zeigt Override-Tabelle.
