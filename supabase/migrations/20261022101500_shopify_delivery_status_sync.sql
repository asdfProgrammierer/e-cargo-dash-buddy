ALTER TABLE public.shop_connections ADD COLUMN IF NOT EXISTS sync_delivery_status boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shopify_event_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shopify_event_error text;
