-- Remove definer view (linter flagged it)
DROP VIEW IF EXISTS public.shop_connections_safe;

-- Restore merchant SELECT policy on base table
CREATE POLICY "Merchants view own shop connections"
ON public.shop_connections
FOR SELECT
TO authenticated
USING (user_id = public.merchant_owner_id(auth.uid()));

-- Column-level privileges: hide api_key and webhook_secret from authenticated role.
-- Admins use a SECURITY DEFINER RPC (admin_get_shop_connection) to read secrets,
-- and edge functions use the service_role which bypasses column grants.
REVOKE SELECT ON public.shop_connections FROM authenticated;
GRANT SELECT (
  id,
  user_id,
  platform,
  shop_domain,
  api_url,
  active,
  auto_fulfill,
  last_external_order_id,
  last_sync_error,
  last_sync_status,
  last_sync_at,
  notizen,
  created_at,
  updated_at
) ON public.shop_connections TO authenticated;

-- Keep INSERT/UPDATE/DELETE for admins (their policies still apply via row level security)
GRANT INSERT, UPDATE, DELETE ON public.shop_connections TO authenticated;