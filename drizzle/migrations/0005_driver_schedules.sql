CREATE TABLE public.driver_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  datum date NOT NULL,
  status text NOT NULL CHECK (status IN ('dienst','frei','urlaub','krank','nicht_verfuegbar')),
  notiz text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, datum)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_schedules TO authenticated;
GRANT ALL ON public.driver_schedules TO service_role;
ALTER TABLE public.driver_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage driver schedules" ON public.driver_schedules FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX driver_schedules_datum_idx ON public.driver_schedules(datum);
CREATE TRIGGER driver_schedules_updated_at BEFORE UPDATE ON public.driver_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();