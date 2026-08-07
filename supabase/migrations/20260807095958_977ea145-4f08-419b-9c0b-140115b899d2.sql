ALTER TABLE public.shop_connections
  ADD COLUMN IF NOT EXISTS webhook_cutoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS poll_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_source_names text[] NOT NULL DEFAULT ARRAY['pos','shopify_pos'];

COMMENT ON COLUMN public.shop_connections.webhook_cutoff_at IS 'Nur Bestellungen mit updated_at/created_at >= diesem Zeitpunkt werden per Webhook uebernommen (Schutz gegen Alt-Bestand/Replays).';
COMMENT ON COLUMN public.shop_connections.poll_sync_enabled IS 'Legacy 15-Min-Poll (shopify-sync, unshipped orders). Default aus, seit die Webhook-Anbindung auf fulfilled laeuft.';
COMMENT ON COLUMN public.shop_connections.pos_source_names IS 'Shopify source_name Werte, die als Vor-Ort-/POS-Verkauf gelten und verworfen werden.';

CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_external_ref_uniq
  ON public.orders (shop_connection_id, external_order_ref)
  WHERE shop_connection_id IS NOT NULL AND external_order_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.shopify_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.shop_connections(id) ON DELETE CASCADE,
  topic text,
  external_order_ref text,
  external_order_name text,
  source_name text,
  decision text NOT NULL,
  reason text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shopify_webhook_log TO authenticated;
GRANT ALL ON public.shopify_webhook_log TO service_role;

ALTER TABLE public.shopify_webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read shopify webhook log"
  ON public.shopify_webhook_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS shopify_webhook_log_created_idx ON public.shopify_webhook_log (created_at DESC);

SELECT cron.unschedule('shopify-sync-every-15min');