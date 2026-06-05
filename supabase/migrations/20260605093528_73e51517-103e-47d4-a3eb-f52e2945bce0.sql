CREATE TABLE public.delivery_modes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  photo_required BOOLEAN NOT NULL DEFAULT false,
  signature_required BOOLEAN NOT NULL DEFAULT false,
  recipient_name_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.delivery_modes TO authenticated;
GRANT ALL ON public.delivery_modes TO service_role;

ALTER TABLE public.delivery_modes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read delivery modes"
  ON public.delivery_modes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage delivery modes"
  ON public.delivery_modes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_delivery_modes_updated_at
  BEFORE UPDATE ON public.delivery_modes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.delivery_modes (key, label, active, photo_required, signature_required, recipient_name_required, sort_order) VALUES
  ('persoenlich', 'Persönlich übergeben', true, false, true, false, 1),
  ('briefkasten', 'In Briefkasten', true, true, false, false, 2),
  ('nachbar', 'An Nachbar', true, true, false, true, 3),
  ('bemerkung', 'Mit Bemerkung', true, false, false, false, 4);
