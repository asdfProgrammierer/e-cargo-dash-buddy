DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.route_stops;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.routes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.route_stops REPLICA IDENTITY FULL;
ALTER TABLE public.routes REPLICA IDENTITY FULL;