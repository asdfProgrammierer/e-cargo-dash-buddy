CREATE OR REPLACE FUNCTION public.driver_update_location(_lat double precision, _lng double precision, _accuracy double precision DEFAULT NULL::double precision)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d_id uuid;
BEGIN
  SELECT id INTO d_id FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1;
  IF d_id IS NULL THEN RAISE EXCEPTION 'Not a driver'; END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'Invalid coordinates';
  END IF;
  INSERT INTO public.driver_locations (driver_id, lat, lng, accuracy, updated_at)
  VALUES (d_id, _lat, _lng, _accuracy, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, accuracy = EXCLUDED.accuracy, updated_at = now();
  -- Arbeitszeit endet jetzt mit dem letzten Stopp (driver-update-stop-status), nicht mehr bei Depot-Ankunft.
END;
$function$;