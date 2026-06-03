-- 1. Restrict shop_connections: remove broad merchant SELECT, expose safe view instead
DROP POLICY IF EXISTS "Merchants view own shop connections" ON public.shop_connections;

CREATE OR REPLACE VIEW public.shop_connections_safe
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  platform,
  shop_domain,
  api_url,
  active,
  auto_fulfill,
  last_sync_at,
  last_sync_status,
  last_sync_error,
  last_external_order_id,
  notizen,
  created_at,
  updated_at
FROM public.shop_connections;

GRANT SELECT ON public.shop_connections_safe TO authenticated;

-- Merchants can read their own non-sensitive shop connection fields via the safe view.
-- The view uses security_invoker, so we need a SELECT policy on the base table scoped
-- to the same non-sensitive use, but excluding sensitive columns via the view.
-- We grant merchants direct SELECT on the base table only for ownership checks needed by
-- the view (security_invoker re-evaluates RLS as the caller).
CREATE POLICY "Merchants view own shop connections (safe columns)"
  ON public.shop_connections
  FOR SELECT
  TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

-- Revoke direct column access to sensitive credentials for merchants/anon.
REVOKE SELECT ON public.shop_connections FROM authenticated, anon;
GRANT SELECT (
  id, user_id, platform, shop_domain, api_url, active, auto_fulfill,
  last_sync_at, last_sync_status, last_sync_error, last_external_order_id,
  notizen, created_at, updated_at
) ON public.shop_connections TO authenticated;
-- Admins still need full read for management UI; ALL policy + service_role bypass cover writes.
-- Grant full column access via a separate role check is not possible in pure GRANT,
-- so admins read sensitive fields via admin_get_shop_connection() definer function (already exists).

-- 2. delivery-photos: driver INSERT + merchant SELECT
CREATE POLICY "Drivers upload photos for own stops"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[1] = 'stops'
    AND public.is_stop_route_driver(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "Drivers update photos for own stops"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[1] = 'stops'
    AND public.is_stop_route_driver(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "Merchants read photos for own orders"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[3] = 'orders'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = ((storage.foldername(name))[4])::uuid
        AND o.user_id = public.merchant_owner_id(auth.uid())
    )
  );

CREATE POLICY "Admins manage delivery photos"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'delivery-photos' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'delivery-photos' AND public.has_role(auth.uid(), 'admin'));