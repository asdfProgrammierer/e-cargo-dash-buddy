
CREATE TABLE public.driver_locations (
  driver_id uuid PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.driver_locations TO authenticated;
GRANT ALL ON public.driver_locations TO service_role;

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all driver locations"
  ON public.driver_locations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Driver reads own location"
  ON public.driver_locations FOR SELECT
  TO authenticated
  USING (driver_id = public.current_driver_id());

ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
ALTER TABLE public.driver_locations REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.driver_update_location(_lat double precision, _lng double precision, _accuracy double precision DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_id uuid;
BEGIN
  SELECT id INTO d_id FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1;
  IF d_id IS NULL THEN
    RAISE EXCEPTION 'Not a driver';
  END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'Invalid coordinates';
  END IF;

  INSERT INTO public.driver_locations (driver_id, lat, lng, accuracy, updated_at)
  VALUES (d_id, _lat, _lng, _accuracy, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        accuracy = EXCLUDED.accuracy,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_update_location(double precision, double precision, double precision) TO authenticated;
