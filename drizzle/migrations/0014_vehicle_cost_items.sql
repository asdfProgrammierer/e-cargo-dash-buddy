CREATE TABLE public.vehicle_cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  bezeichnung text NOT NULL,
  intervall text NOT NULL CHECK (intervall IN ('monat','jahr','km')),
  betrag numeric NOT NULL CHECK (betrag >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_cost_items TO authenticated;
GRANT ALL ON public.vehicle_cost_items TO service_role;
ALTER TABLE public.vehicle_cost_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage vehicle cost items" ON public.vehicle_cost_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX vehicle_cost_items_vehicle_idx ON public.vehicle_cost_items(vehicle_id);
CREATE TRIGGER vehicle_cost_items_updated_at BEFORE UPDATE ON public.vehicle_cost_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.vehicle_cost_items (vehicle_id, bezeichnung, intervall, betrag)
  SELECT id, 'Fixkosten (pauschal)', 'monat', fixkosten_monat FROM public.vehicles WHERE fixkosten_monat > 0;
INSERT INTO public.vehicle_cost_items (vehicle_id, bezeichnung, intervall, betrag)
  SELECT id, 'Variable Kosten (pauschal)', 'km', kosten_pro_km FROM public.vehicles WHERE kosten_pro_km > 0;
COMMENT ON COLUMN public.vehicles.fixkosten_monat IS 'DEPRECATED: replaced by vehicle_cost_items';
COMMENT ON COLUMN public.vehicles.kosten_pro_km IS 'DEPRECATED: replaced by vehicle_cost_items';