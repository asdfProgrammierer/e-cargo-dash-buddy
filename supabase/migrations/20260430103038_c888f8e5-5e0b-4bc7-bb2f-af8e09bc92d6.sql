ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0;