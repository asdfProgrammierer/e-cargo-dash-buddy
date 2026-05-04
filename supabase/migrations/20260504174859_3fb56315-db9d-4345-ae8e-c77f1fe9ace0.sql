ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dhl_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dhl_label_url text,
  ADD COLUMN IF NOT EXISTS dhl_tracking_number text,
  ADD COLUMN IF NOT EXISTS dhl_shipment_no text,
  ADD COLUMN IF NOT EXISTS dhl_label_created_at timestamptz;