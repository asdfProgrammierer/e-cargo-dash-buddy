---
name: Delivery Modes (Übergabe-Arten)
description: Admin-configurable delivery handover modes with per-mode required fields for the driver app
type: feature
---
- Table `delivery_modes` (key, label, active, photo_required, signature_required, recipient_name_required, sort_order).
- Admin page: `/admin/einstellungen/uebergabe` (DeliveryModesPage) — toggle active, rename label, set required fields.
- Driver app loads active modes via `useDeliveryModes({ onlyActive: true })` and renders large tap-card radios with required-field hints.
- Validation happens both client-side (driver app) and server-side (edge function `driver-update-stop-status`) against the table.
- Default seeded modes: persoenlich (Unterschrift Pflicht), briefkasten (Foto Pflicht), nachbar (Foto + Name Pflicht), bemerkung (keine Pflicht).
