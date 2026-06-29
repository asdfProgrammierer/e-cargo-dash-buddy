
CREATE TABLE public.merchant_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  label text NOT NULL DEFAULT 'API-Key',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX merchant_api_keys_user_idx ON public.merchant_api_keys(user_id) WHERE revoked_at IS NULL;

GRANT SELECT ON public.merchant_api_keys TO authenticated;
GRANT ALL ON public.merchant_api_keys TO service_role;

ALTER TABLE public.merchant_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all api keys"
ON public.merchant_api_keys
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Merchants read own api keys"
ON public.merchant_api_keys
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR user_id = public.merchant_owner_id(auth.uid()));

-- Idempotency support for the external WaWi API: each merchant may push the
-- same external_ref only once when the order does not belong to a shop_connection.
CREATE UNIQUE INDEX orders_user_external_ref_unique
ON public.orders (user_id, external_order_ref)
WHERE shop_connection_id IS NULL AND external_order_ref IS NOT NULL;
