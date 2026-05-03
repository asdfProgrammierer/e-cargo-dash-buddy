CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  parent_id uuid;
BEGIN
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