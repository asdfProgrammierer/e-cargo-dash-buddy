
-- Maintenance types
CREATE TYPE public.maintenance_type AS ENUM ('tuev', 'inspektion', 'reifenwechsel', 'oelwechsel', 'bremsen', 'batterie', 'sonstige');
CREATE TYPE public.maintenance_status AS ENUM ('geplant', 'faellig', 'ueberfaellig', 'erledigt');

-- Maintenance schedule per vehicle
CREATE TABLE public.maintenance_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  typ maintenance_type NOT NULL,
  bezeichnung TEXT NOT NULL,
  faellig_am DATE NOT NULL,
  erledigt_am DATE,
  status maintenance_status NOT NULL DEFAULT 'geplant',
  kosten NUMERIC,
  notizen TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage maintenance" ON public.maintenance_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON public.maintenance_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vehicle inspections (14-day checklist)
CREATE TABLE public.vehicle_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  inspected_by TEXT NOT NULL,
  inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reifen_ok BOOLEAN NOT NULL DEFAULT false,
  reifen_notiz TEXT,
  bremsen_ok BOOLEAN NOT NULL DEFAULT false,
  bremsen_notiz TEXT,
  lichter_ok BOOLEAN NOT NULL DEFAULT false,
  lichter_notiz TEXT,
  ausstattung_ok BOOLEAN NOT NULL DEFAULT false,
  ausstattung_notiz TEXT,
  spiegel_ok BOOLEAN NOT NULL DEFAULT false,
  spiegel_notiz TEXT,
  sauberkeit_ok BOOLEAN NOT NULL DEFAULT false,
  sauberkeit_notiz TEXT,
  allgemein_notiz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage inspections" ON public.vehicle_inspections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
