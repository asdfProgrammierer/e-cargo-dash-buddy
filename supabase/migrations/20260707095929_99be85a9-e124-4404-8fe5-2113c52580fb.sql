
CREATE OR REPLACE FUNCTION public.maybe_create_pickup_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m record;
  weekday int;
  today_berlin date;
  already_exists boolean;
  sender_name text;
  adresse text;
  note text;
  err_msg text;
  err_state text;
BEGIN
  IF NEW.is_pickup THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.firma_name, p.ansprechpartner, p.telefon, p.strasse, p.plz, p.stadt,
         p.pickup_enabled, p.pickup_weekdays, p.approved, p.pickup_note
    INTO m
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id;

  IF NOT FOUND
     OR COALESCE(m.pickup_enabled, false) = false
     OR COALESCE(m.approved, false) = false
     OR m.strasse IS NULL OR m.plz IS NULL OR m.stadt IS NULL
     OR m.pickup_weekdays IS NULL THEN
    RETURN NEW;
  END IF;

  weekday := EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/Berlin'))::int;
  IF NOT (weekday = ANY (m.pickup_weekdays)) THEN
    RETURN NEW;
  END IF;

  today_berlin := (now() AT TIME ZONE 'Europe/Berlin')::date;

  SELECT EXISTS(
    SELECT 1 FROM public.orders o
    WHERE o.user_id = NEW.user_id
      AND o.is_pickup = true
      AND ((o.created_at AT TIME ZONE 'Europe/Berlin')::date) = today_berlin
  ) INTO already_exists;

  IF already_exists THEN
    RETURN NEW;
  END IF;

  sender_name := COALESCE(m.firma_name, m.ansprechpartner, 'Händler');
  adresse := m.strasse || ', ' || m.plz || ' ' || m.stadt;
  note := COALESCE(m.pickup_note, '[ABHOLUNG] Automatisch generierter Abhol-Auftrag');

  BEGIN
    INSERT INTO public.orders (
      user_id, auftrags_nr,
      absender_name, absender_adresse,
      empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt,
      empfaenger_email, empfaenger_telefon,
      pakete, gewicht, notizen, is_pickup
    ) VALUES (
      NEW.user_id, '',
      sender_name, adresse,
      sender_name, m.strasse, m.plz, m.stadt,
      NULL, m.telefon,
      1, 0, note, true
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT, err_state = RETURNED_SQLSTATE;
    INSERT INTO public.admin_audit_log (actor_user_id, actor_role, entity_type, entity_id, action, metadata)
    VALUES (NEW.user_id, 'system', 'order', NEW.id::text, 'pickup_auto_create_failed',
            jsonb_build_object('error', err_msg, 'sqlstate', err_state, 'merchant', NEW.user_id));
  END;

  RETURN NEW;
END;
$function$;
