CREATE OR REPLACE FUNCTION public.generate_auftrags_nr()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  merchant_code_value text;
  next_nr integer;
  prefix text;
  pattern text;
BEGIN
  SELECT upper(trim(p.merchant_code))
  INTO merchant_code_value
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id;

  IF merchant_code_value IS NULL THEN
    RAISE EXCEPTION 'Für diesen Händler ist kein Händlercode hinterlegt';
  END IF;

  IF NEW.is_pickup THEN
    prefix := 'EC-' || merchant_code_value || '-P';
    pattern := '^EC-' || merchant_code_value || '-P([0-9]{7})$';
  ELSE
    prefix := 'EC-' || merchant_code_value || '-';
    pattern := '^EC-' || merchant_code_value || '-([0-9]{7})$';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(prefix, 0));

  SELECT COALESCE(
    MAX(
      CAST(
        substring(o.auftrags_nr FROM pattern) AS integer
      )
    ),
    0
  ) + 1
  INTO next_nr
  FROM public.orders o
  WHERE o.user_id = NEW.user_id
    AND o.is_pickup = NEW.is_pickup
    AND o.auftrags_nr ~ pattern;

  NEW.auftrags_nr := prefix || lpad(next_nr::text, 7, '0');

  RETURN NEW;
END;
$function$;