CREATE OR REPLACE FUNCTION public.auto_pin_finished_stop()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('erledigt','uebersprungen') THEN
      NEW.pinned := true;
    ELSIF NEW.status = 'offen' AND OLD.status IN ('erledigt','uebersprungen') THEN
      NEW.pinned := false;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_pin_finished_stop ON public.route_stops;
CREATE TRIGGER trg_auto_pin_finished_stop BEFORE UPDATE ON public.route_stops
FOR EACH ROW EXECUTE FUNCTION public.auto_pin_finished_stop();

UPDATE public.route_stops SET pinned = true WHERE status IN ('erledigt','uebersprungen') AND pinned = false;