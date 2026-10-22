CREATE TABLE public.driver_schedule_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_start_time time without time zone,
  enabled_statuses text[] NOT NULL DEFAULT ARRAY['dienst','frei','urlaub','krank','nicht_verfuegbar'],
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.driver_schedule_settings TO authenticated;
GRANT ALL ON public.driver_schedule_settings TO service_role;
ALTER TABLE public.driver_schedule_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage driver schedule settings" ON public.driver_schedule_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.driver_schedule_settings (id) VALUES (1);