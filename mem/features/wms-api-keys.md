---
name: WMS API Keys pro Händler
description: Händlerspezifische API-Schlüssel für die wms-create-shipment Schnittstelle
type: feature
---
- Tabelle `wms_api_keys` (user_id, merchant_code, label, key_hash SHA-256, key_prefix, active, last_used_at). Nur Admins per RLS.
- Erzeugung via Edge Function `admin-create-wms-key` (`wms_live_<base64url>`), Klartext nur einmalig in der Antwort.
- Verwaltung im Admin unter Händler-Detail → Tab „Einstellungen" (`WmsApiKeysCard`).
- `wms-create-shipment`: Header `x-wms-api-key` wird gehasht und in `wms_api_keys` gesucht; Händlercode kommt aus dem Key, `merchant_reference` im Payload optional (muss bei Angabe passen).
- Globaler Secret `WMS_API_KEY` bleibt Fallback — dann ist `merchant_reference` Pflicht.
