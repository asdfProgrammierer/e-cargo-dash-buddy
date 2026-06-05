# Project Memory

## Core
- **Context:** e-cargo, a sustainable local courier logistics service in the Ruhrgebiet.
- **Aesthetic:** Modern, clean, green-centric (Sage/Emerald) to emphasize sustainability.
- **Tech Stack:** Supabase (Auth, DB, RLS, Realtime).
- **UX:** Supabase Realtime for instant order updates via in-app toasts.
- **Format:** Order IDs must follow the format `EC-0000001`.

## Memories
- [Order Management](mem://features/orders) — Order creation (manual/CSV/Excel), inline editing, search/filter, timeline.
- [Auth & Profiles](mem://features/auth-profiles) — Supabase profiles storing business data for auto-filling sender info.
- [Global Layout](mem://ui/layout) — Header clock (Berlin), dark mode, sidebar logout, single-row status filters.
- [Registration Flow](mem://auth/registration-flow) — Email confirmation and manual admin approval required.
- [Address Book](mem://features/address-book) — Merchant address book with favorites and inline saving.
- [Shop Integrations](mem://features/shop-integrations) — External shop APIs/webhooks (Shopify, WooCommerce).
- [Shipping Labels](mem://features/shipping-labels) — 100x150mm labels with barcode, single and bulk printing.
- [Order Constraints](mem://constraints/order-management) — Orders locked after 'unterwegs', no manual merchant status changes.
- [GDPR Data Retention](mem://constraints/data-retention) — Auto-delete orders after 2 months via pg_cron.
- [Dashboard Analytics](mem://features/dashboard-analytics) — Volume trends, CO2 counter (0.5kg/parcel), date filters.
- [Role Based Access Control](mem://auth/rbac) — admin, moderator, user roles with RLS policies and has_role logic.
- [Admin Portal](mem://features/admin-portal) — Central system management, merchant approvals, global stats.
- [Logistics Management](mem://features/logistics-management) — Driver management and operational route planning.
- [Vehicle Management](mem://features/vehicle-management) — Maintenance plans, 14-day safety checklist with traffic light system.
- [Sub-Accounts](mem://features/sub-accounts) — Händler-Mitarbeiterkonten (max. 2) mit gemeinsamen Aufträgen/Adressbuch via parent_user_id.
- [Notifications](mem://features/notifications) — Admin schickt Benachrichtigungen (alle/einzelner Händler), Glocke im Header mit rotem Punkt.
- [Undelivered Confirmation](mem://features/undelivered-confirmation) — Jeder Fahrer-Skip braucht Admin-Freigabe via delivery_unconfirmed Flag + admin_resolve_undelivered_order RPC.
- [Delivery Modes](mem://features/delivery-modes) — Admin-konfigurierbare Übergabe-Arten (Foto/Unterschrift/Name Pflicht) für die Fahrer-App.
