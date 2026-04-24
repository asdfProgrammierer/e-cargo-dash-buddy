-- 1. Tracking-Token auf orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_token text UNIQUE;

-- Token-Generator-Funktion
CREATE OR REPLACE FUNCTION public.generate_tracking_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_token IS NULL THEN
    NEW.tracking_token := encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tracking_token ON public.orders;
CREATE TRIGGER set_tracking_token
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_tracking_token();

-- Bestehende Aufträge nachziehen
UPDATE public.orders
SET tracking_token = encode(gen_random_bytes(32), 'hex')
WHERE tracking_token IS NULL;

-- 2. Lieferanweisungen
CREATE TABLE IF NOT EXISTS public.delivery_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  freetext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT freetext_length CHECK (freetext IS NULL OR length(freetext) <= 200)
);

ALTER TABLE public.delivery_instructions ENABLE ROW LEVEL SECURITY;

-- Nur Service Role darf schreiben (über Edge Functions)
CREATE POLICY "Service role manages delivery instructions"
ON public.delivery_instructions
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Admins dürfen lesen (für Dashboard)
CREATE POLICY "Admins can view delivery instructions"
ON public.delivery_instructions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at Trigger
CREATE TRIGGER update_delivery_instructions_updated_at
  BEFORE UPDATE ON public.delivery_instructions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index für Lookup
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON public.orders(tracking_token);