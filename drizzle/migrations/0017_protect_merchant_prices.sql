CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('service_role', 'supabase_admin', 'postgres')
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.approved IS DISTINCT FROM OLD.approved THEN RAISE EXCEPTION 'Nur Admins dürfen den Genehmigungsstatus ändern'; END IF;
  IF NEW.dhl_enabled IS DISTINCT FROM OLD.dhl_enabled THEN RAISE EXCEPTION 'Nur Admins dürfen den DHL-Status ändern'; END IF;
  IF NEW.merchant_code IS DISTINCT FROM OLD.merchant_code THEN RAISE EXCEPTION 'Nur Admins dürfen den Händlercode ändern'; END IF;
  IF NEW.is_virtual IS DISTINCT FROM OLD.is_virtual THEN RAISE EXCEPTION 'Nur Admins dürfen das virtuelle Händler-Flag ändern'; END IF;
  IF NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id THEN RAISE EXCEPTION 'Nur Admins dürfen die übergeordnete Händler-Zuordnung ändern'; END IF;
  IF NEW.paketpreis IS DISTINCT FROM OLD.paketpreis
     OR NEW.stopppreis IS DISTINCT FROM OLD.stopppreis
     OR NEW.stundenpreis IS DISTINCT FROM OLD.stundenpreis
     OR NEW.tagespauschale IS DISTINCT FROM OLD.tagespauschale
     OR NEW.grundbeitrag_monat IS DISTINCT FROM OLD.grundbeitrag_monat THEN
    RAISE EXCEPTION 'Nur Admins dürfen Preise ändern';
  END IF;
  IF NEW.pickup_enabled IS DISTINCT FROM OLD.pickup_enabled
     OR NEW.pickup_weekdays IS DISTINCT FROM OLD.pickup_weekdays
     OR NEW.pickup_time IS DISTINCT FROM OLD.pickup_time
     OR NEW.pickup_note IS DISTINCT FROM OLD.pickup_note THEN
    RAISE EXCEPTION 'Nur Admins dürfen Abhol-Einstellungen ändern';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'user_id kann nicht geändert werden'; END IF;
  RETURN NEW;
END;
$function$;