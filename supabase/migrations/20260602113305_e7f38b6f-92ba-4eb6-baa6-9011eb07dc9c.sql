-- Drop merchant SELECT policy on base table (exposed api_key/webhook_secret)
DROP POLICY IF EXISTS "Merchants view own shop connections" ON public.shop_connections;

-- Safe view without sensitive columns, scoped to merchant/admin via security definer
CREATE OR REPLACE VIEW public.shop_connections_safe
WITH (security_invoker=off) AS
SELECT
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
FROM public.shop_connections
WHERE user_id = public.merchant_owner_id(auth.uid())
   OR public.has_role(auth.uid(), 'admin');

GRANT SELECT ON public.shop_connections_safe TO authenticated;