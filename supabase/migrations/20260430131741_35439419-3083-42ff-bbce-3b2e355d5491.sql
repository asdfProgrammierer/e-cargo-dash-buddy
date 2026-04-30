ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_weekdays smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pickup_time time without time zone;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_pickup boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_pickup_enabled ON public.profiles (pickup_enabled) WHERE pickup_enabled = true;
CREATE INDEX IF NOT EXISTS idx_orders_is_pickup ON public.orders (is_pickup) WHERE is_pickup = true;