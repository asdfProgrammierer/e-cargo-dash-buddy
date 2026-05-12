-- Erweiterung shop_connections: Sync-Tracking + Auto-Fulfillment-Schalter
ALTER TABLE public.shop_connections
  ADD COLUMN IF NOT EXISTS shop_domain text,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS last_external_order_id text,
  ADD COLUMN IF NOT EXISTS auto_fulfill boolean NOT NULL DEFAULT true;

-- Eine Shopify-Verbindung pro Händler ist genug
CREATE UNIQUE INDEX IF NOT EXISTS shop_connections_user_platform_unique
  ON public.shop_connections (user_id, platform);

-- Händler dürfen ihre eigene Shop-Verbindung verwalten (zusätzlich zur Admin-Policy)
DROP POLICY IF EXISTS "Merchants view own shop connections" ON public.shop_connections;
CREATE POLICY "Merchants view own shop connections"
  ON public.shop_connections
  FOR SELECT
  TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

DROP POLICY IF EXISTS "Merchants insert own shop connections" ON public.shop_connections;
CREATE POLICY "Merchants insert own shop connections"
  ON public.shop_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.merchant_owner_id(auth.uid()));

DROP POLICY IF EXISTS "Merchants update own shop connections" ON public.shop_connections;
CREATE POLICY "Merchants update own shop connections"
  ON public.shop_connections
  FOR UPDATE
  TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()))
  WITH CHECK (user_id = public.merchant_owner_id(auth.uid()));

DROP POLICY IF EXISTS "Merchants delete own shop connections" ON public.shop_connections;
CREATE POLICY "Merchants delete own shop connections"
  ON public.shop_connections
  FOR DELETE
  TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

-- Orders um Shop-Referenz erweitern (Dedup + Fulfillment-Rückmeldung)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shop_connection_id uuid,
  ADD COLUMN IF NOT EXISTS external_order_ref text,
  ADD COLUMN IF NOT EXISTS external_order_name text,
  ADD COLUMN IF NOT EXISTS shopify_fulfillment_id text,
  ADD COLUMN IF NOT EXISTS shopify_fulfilled_at timestamptz;

-- Verhindert doppelten Import derselben Shopify-Bestellung
CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_external_unique
  ON public.orders (shop_connection_id, external_order_ref)
  WHERE shop_connection_id IS NOT NULL AND external_order_ref IS NOT NULL;

-- Index für Fulfillment-Push-Job
CREATE INDEX IF NOT EXISTS orders_pending_fulfillment_idx
  ON public.orders (shop_connection_id, status)
  WHERE shop_connection_id IS NOT NULL AND shopify_fulfilled_at IS NULL;