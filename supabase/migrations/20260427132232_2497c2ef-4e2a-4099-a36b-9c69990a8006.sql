-- Add start_time to routes
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '09:00';

-- Singleton settings table for route planning defaults
CREATE TABLE IF NOT EXISTS public.route_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stop_duration_minutes integer NOT NULL DEFAULT 4 CHECK (stop_duration_minutes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.route_settings (id, stop_duration_minutes)
VALUES (1, 4)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.route_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view route settings" ON public.route_settings;
CREATE POLICY "Admins can view route settings"
  ON public.route_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update route settings" ON public.route_settings;
CREATE POLICY "Admins can update route settings"
  ON public.route_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_route_settings_updated_at ON public.route_settings;
CREATE TRIGGER trg_route_settings_updated_at
  BEFORE UPDATE ON public.route_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();