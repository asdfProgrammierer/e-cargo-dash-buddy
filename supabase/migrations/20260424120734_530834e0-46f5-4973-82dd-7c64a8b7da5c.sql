-- Depots table
CREATE TABLE public.depots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  strasse text NOT NULL,
  plz text NOT NULL,
  stadt text NOT NULL,
  land text NOT NULL DEFAULT 'Deutschland',
  lat numeric,
  lng numeric,
  geocoded_at timestamptz,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.depots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage depots"
  ON public.depots
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ensure only one default depot
CREATE OR REPLACE FUNCTION public.ensure_single_default_depot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.depots
    SET is_default = false
    WHERE id <> NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_depots_single_default
BEFORE INSERT OR UPDATE OF is_default ON public.depots
FOR EACH ROW
WHEN (NEW.is_default = true)
EXECUTE FUNCTION public.ensure_single_default_depot();

CREATE TRIGGER trg_depots_updated_at
BEFORE UPDATE ON public.depots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add geocoding columns to orders
ALTER TABLE public.orders
  ADD COLUMN lat numeric,
  ADD COLUMN lng numeric,
  ADD COLUMN geocoded_at timestamptz;

CREATE INDEX idx_orders_geocoded ON public.orders(geocoded_at) WHERE geocoded_at IS NOT NULL;