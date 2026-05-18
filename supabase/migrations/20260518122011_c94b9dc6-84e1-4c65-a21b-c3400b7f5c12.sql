
-- Update storage policies for sub-account support
DROP POLICY IF EXISTS "Merchants read own delivery notes" ON storage.objects;
CREATE POLICY "Merchants read own delivery notes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-notes'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.user_id = public.merchant_owner_id(auth.uid())
      AND (storage.foldername(name))[1] = 'orders'
      AND (storage.foldername(name))[2] = o.id::text
  )
);

DROP POLICY IF EXISTS "Merchants read signatures for own orders" ON storage.objects;
CREATE POLICY "Merchants read signatures for own orders"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-signatures'
  AND (storage.foldername(name))[3] = 'orders'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = ((storage.foldername(name))[4])::uuid
      AND o.user_id = public.merchant_owner_id(auth.uid())
  )
);

-- Profiles SELECT policy: scope to authenticated
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Re-assert column-level revokes on shop_connections secrets (defense in depth)
REVOKE SELECT (api_key, webhook_secret) ON public.shop_connections FROM authenticated, anon;
