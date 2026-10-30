CREATE OR REPLACE FUNCTION public.prevent_merchant_edit_locked_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _locked boolean;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role'
     OR auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'driver') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _locked := OLD.status NOT IN ('neu')
    OR EXISTS (
      SELECT 1 FROM public.route_stops rs JOIN public.routes r ON r.id = rs.route_id
      WHERE rs.order_id = OLD.id AND r.status = 'aktiv'
    );

  IF NOT _locked THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Auftrag ist gesperrt (bereits in Zustellung) und kann nicht gelöscht werden';
  END IF;

  IF NEW.empfaenger_name IS DISTINCT FROM OLD.empfaenger_name
     OR NEW.empfaenger_adresse IS DISTINCT FROM OLD.empfaenger_adresse
     OR NEW.empfaenger_plz IS DISTINCT FROM OLD.empfaenger_plz
     OR NEW.empfaenger_stadt IS DISTINCT FROM OLD.empfaenger_stadt
     OR NEW.empfaenger_email IS DISTINCT FROM OLD.empfaenger_email
     OR NEW.empfaenger_telefon IS DISTINCT FROM OLD.empfaenger_telefon
     OR NEW.pakete IS DISTINCT FROM OLD.pakete
     OR NEW.gewicht IS DISTINCT FROM OLD.gewicht
     OR NEW.package_length_cm IS DISTINCT FROM OLD.package_length_cm
     OR NEW.package_width_cm IS DISTINCT FROM OLD.package_width_cm
     OR NEW.package_height_cm IS DISTINCT FROM OLD.package_height_cm
     OR NEW.notizen IS DISTINCT FROM OLD.notizen
     OR NEW.signature_required IS DISTINCT FROM OLD.signature_required
     OR NEW.absender_name IS DISTINCT FROM OLD.absender_name
     OR NEW.absender_adresse IS DISTINCT FROM OLD.absender_adresse THEN
    RAISE EXCEPTION 'Auftrag ist gesperrt (bereits in Zustellung) und kann nicht mehr geändert werden';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_merchant_order_lock ON public.orders;
CREATE TRIGGER enforce_merchant_order_lock
BEFORE UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_merchant_edit_locked_order();