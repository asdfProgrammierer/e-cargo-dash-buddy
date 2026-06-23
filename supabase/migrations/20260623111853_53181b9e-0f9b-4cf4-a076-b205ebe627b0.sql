
-- Fix 1: Drop drivers self-update policy. Drivers must use driver_touch_last_login RPC.
DROP POLICY IF EXISTS "Driver updates own driver row" ON public.drivers;

-- Fix 2: Ensure column-level privileges on shop_connections prevent SELECT * exposing api_key/webhook_secret to merchants.
-- Revoke all on table from authenticated/anon and grant only safe columns.
REVOKE ALL ON public.shop_connections FROM authenticated;
REVOKE ALL ON public.shop_connections FROM anon;

GRANT SELECT (id, user_id, platform, api_url, active, notizen, created_at, updated_at, shop_domain, last_sync_at, last_sync_status, last_sync_error, last_external_order_id, auto_fulfill)
  ON public.shop_connections TO authenticated;

-- Admins use service_role or admin_get_shop_connection RPC; keep service_role full access
GRANT ALL ON public.shop_connections TO service_role;
