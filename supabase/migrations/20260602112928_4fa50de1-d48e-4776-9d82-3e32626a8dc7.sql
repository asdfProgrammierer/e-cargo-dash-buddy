CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  parent_id uuid;
BEGIN
  -- Skip profile creation for driver auth users
  IF NEW.raw_user_meta_data ? 'driver_id' THEN
    RETURN NEW;
  END IF;

  parent_id := NULLIF(NEW.raw_user_meta_data->>'parent_user_id', '')::uuid;

  INSERT INTO public.profiles (user_id, ansprechpartner, parent_user_id, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    parent_id,
    parent_id IS NOT NULL
  );
  RETURN NEW;
END;
$function$;

-- Clean up any stray merchant profiles that were auto-created for existing drivers
DELETE FROM public.profiles p
USING public.drivers d
WHERE p.user_id = d.auth_user_id
  AND d.auth_user_id IS NOT NULL;