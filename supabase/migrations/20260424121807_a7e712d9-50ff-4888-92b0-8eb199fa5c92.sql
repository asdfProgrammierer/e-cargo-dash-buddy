-- Add optimization result columns to routes
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS start_depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS end_depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_distance_m integer,
  ADD COLUMN IF NOT EXISTS total_duration_s integer,
  ADD COLUMN IF NOT EXISTS geometry jsonb,
  ADD COLUMN IF NOT EXISTS optimized_at timestamptz;

CREATE TYPE public.route_stop_status AS ENUM ('offen', 'erledigt', 'uebersprungen');

CREATE TABLE public.route_stops (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  eta timestamptz,
  leg_distance_m integer,
  leg_duration_s integer,
  status public.route_stop_status NOT NULL DEFAULT 'offen',
  notiz text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, order_id)
);

CREATE INDEX idx_route_stops_route ON public.route_stops(route_id, position);
CREATE INDEX idx_route_stops_order ON public.route_stops(order_id);

ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage route stops"
  ON public.route_stops
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_route_stops_updated_at
  BEFORE UPDATE ON public.route_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();