REVOKE SELECT, UPDATE ON public.shop_connections FROM authenticated;
REVOKE SELECT, UPDATE ON public.shop_connections FROM anon;

GRANT SELECT (
  id, user_id, platform, api_url, shop_domain, active, auto_fulfill, notizen,
  last_sync_at, last_sync_status, last_sync_error, last_external_order_id,
  created_at, updated_at
) ON public.shop_connections TO authenticated;

GRANT UPDATE (
  platform, api_url, shop_domain, active, auto_fulfill, notizen,
  last_sync_at, last_sync_status, last_sync_error, last_external_order_id,
  updated_at, api_key, webhook_secret
) ON public.shop_connections TO authenticated;

GRANT ALL ON public.shop_connections TO service_role;