ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS geocode_quality text,
  ADD COLUMN IF NOT EXISTS geocode_note text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_geocode_quality_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_geocode_quality_check
  CHECK (geocode_quality IS NULL OR geocode_quality IN ('exact', 'approximate'));

-- Existing coordinates were stored without a quality check: mark open
-- orders as unchecked so the background job re-verifies them.
UPDATE public.orders
   SET geocode_quality = NULL
 WHERE status IN ('neu', 'in_bearbeitung');

-- Reset address quality automatically whenever the recipient address changes
CREATE OR REPLACE FUNCTION public.reset_geocode_on_address_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.empfaenger_adresse IS DISTINCT FROM OLD.empfaenger_adresse
      OR NEW.empfaenger_plz IS DISTINCT FROM OLD.empfaenger_plz
      OR NEW.empfaenger_stadt IS DISTINCT FROM OLD.empfaenger_stadt)
     AND NEW.lat IS NOT DISTINCT FROM OLD.lat
     AND NEW.lng IS NOT DISTINCT FROM OLD.lng THEN
    NEW.lat := NULL;
    NEW.lng := NULL;
    NEW.geocoded_at := NULL;
    NEW.geocode_quality := NULL;
    NEW.geocode_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_geocode_on_address_change ON public.orders;
CREATE TRIGGER trg_reset_geocode_on_address_change
BEFORE UPDATE OF empfaenger_adresse, empfaenger_plz, empfaenger_stadt ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.reset_geocode_on_address_change();