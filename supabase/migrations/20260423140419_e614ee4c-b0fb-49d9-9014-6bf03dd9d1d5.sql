ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS merchant_code text;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_merchant_code_format_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_merchant_code_format_check
CHECK (
  merchant_code IS NULL
  OR merchant_code ~ '^[A-Z0-9]{3}$'
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_merchant_code_unique_idx
ON public.profiles (merchant_code)
WHERE merchant_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_auftrags_nr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  merchant_code_value text;
  next_nr integer;
BEGIN
  SELECT upper(trim(p.merchant_code))
  INTO merchant_code_value
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id;

  IF merchant_code_value IS NULL THEN
    RAISE EXCEPTION 'Für diesen Händler ist kein Händlercode hinterlegt';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(merchant_code_value, 0));

  SELECT COALESCE(
    MAX(
      CAST(
        substring(o.auftrags_nr FROM '([0-9]{7})$') AS integer
      )
    ),
    0
  ) + 1
  INTO next_nr
  FROM public.orders o
  WHERE o.user_id = NEW.user_id
    AND o.auftrags_nr LIKE 'EC-' || merchant_code_value || '-%';

  NEW.auftrags_nr := 'EC-' || merchant_code_value || '-' || lpad(next_nr::text, 7, '0');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS generate_auftrags_nr_before_insert ON public.orders;

CREATE TRIGGER generate_auftrags_nr_before_insert
BEFORE INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.auftrags_nr IS NULL OR btrim(NEW.auftrags_nr) = '')
EXECUTE FUNCTION public.generate_auftrags_nr();

CREATE OR REPLACE FUNCTION public.admin_set_merchant_code(_profile_id uuid, _merchant_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  normalized_code text;
  target_user_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen Händlercodes verwalten';
  END IF;

  normalized_code := upper(trim(_merchant_code));

  IF normalized_code !~ '^[A-Z0-9]{3}$' THEN
    RAISE EXCEPTION 'Händlercode muss genau 3 Zeichen haben';
  END IF;

  SELECT p.user_id
  INTO target_user_id
  FROM public.profiles p
  WHERE p.id = _profile_id;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Händlerprofil nicht gefunden';
  END IF;

  UPDATE public.profiles
  SET merchant_code = normalized_code,
      updated_at = now()
  WHERE id = _profile_id;

  PERFORM pg_advisory_xact_lock(hashtextextended(normalized_code, 0));

  WITH ordered_orders AS (
    SELECT
      o.id,
      row_number() OVER (ORDER BY o.created_at ASC, o.id ASC) AS seq_nr
    FROM public.orders o
    WHERE o.user_id = target_user_id
  )
  UPDATE public.orders o
  SET auftrags_nr = 'EC-' || normalized_code || '-' || lpad(ordered_orders.seq_nr::text, 7, '0'),
      updated_at = now()
  FROM ordered_orders
  WHERE o.id = ordered_orders.id;

  RETURN normalized_code;
END;
$function$;