ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS external_source_ref text,
  ADD COLUMN IF NOT EXISTS external_source_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_source_system_ref_uniq
  ON public.orders (source_system, external_source_ref)
  WHERE source_system IS NOT NULL AND external_source_ref IS NOT NULL;