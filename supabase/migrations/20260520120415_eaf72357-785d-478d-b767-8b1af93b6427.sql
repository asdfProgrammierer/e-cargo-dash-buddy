
-- 1) Restrict sensitive columns on shop_connections from authenticated users.
--    Service role retains full access. Admins will read via a SECURITY DEFINER RPC.
REVOKE SELECT (api_key, webhook_secret) ON public.shop_connections FROM authenticated;
REVOKE SELECT (api_key, webhook_secret) ON public.shop_connections FROM anon;

CREATE OR REPLACE FUNCTION public.admin_get_shop_connection(_user_id uuid)
RETURNS public.shop_connections
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.shop_connections;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen Shop-Verbindungen mit Secrets lesen';
  END IF;
  SELECT * INTO result
  FROM public.shop_connections
  WHERE user_id = _user_id
  LIMIT 1;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_shop_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_shop_connection(uuid) TO authenticated;

-- 2) Restrict dhl_products to admins only (billing_number is sensitive).
--    Edge functions use the service role and continue to work.
DROP POLICY IF EXISTS "Authenticated read dhl_products" ON public.dhl_products;

CREATE POLICY "Admins read dhl_products"
ON public.dhl_products
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
