
-- 1) Unschedule alten Cron-Job (falls vorhanden)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'generate-pickup-orders-daily';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- 2) Alte Hilfsfunktionen entfernen
DROP FUNCTION IF EXISTS public.admin_get_pickup_cron_status();
DROP FUNCTION IF EXISTS public.admin_get_pickup_cron_runs(integer);
DROP FUNCTION IF EXISTS public.admin_set_pickup_deadline(smallint, smallint);

-- 3) Alte Settings-Tabelle entfernen
DROP TABLE IF EXISTS public.pickup_cron_settings;

-- 4) Trigger-Funktion: erzeugt Abhol-Auftrag, sobald Händler heute die erste reguläre Sendung anlegt
CREATE OR REPLACE FUNCTION public.maybe_create_pickup_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  weekday int;
  today_berlin date;
  already_exists boolean;
  sender_name text;
  adresse text;
BEGIN
  -- Nur für reguläre Bestellungen
  IF NEW.is_pickup THEN
    RETURN NEW;
  END IF;

  -- Händler laden
  SELECT user_id, firma_name, ansprechpartner, telefon, strasse, plz, stadt,
         pickup_enabled, pickup_weekdays, approved
    INTO m
  FROM public.profiles
  WHERE user_id = NEW.user_id;

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
    1, 0, '[ABHOLUNG] Automatisch generierter Abhol-Auftrag', true
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Niemals den ursprünglichen Insert wegen Abhol-Logik scheitern lassen
  RAISE WARNING 'maybe_create_pickup_order failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 5) Trigger anlegen
DROP TRIGGER IF EXISTS trg_maybe_create_pickup_order ON public.orders;
CREATE TRIGGER trg_maybe_create_pickup_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.maybe_create_pickup_order();
