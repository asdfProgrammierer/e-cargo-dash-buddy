ALTER TABLE public.route_stops
  ADD COLUMN completed_lat numeric,
  ADD COLUMN completed_lng numeric,
  ADD COLUMN completed_accuracy_m numeric;