CREATE OR REPLACE FUNCTION public.prevent_non_admin_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.has_role(auth.uid(), 'admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only admins can change order status';
  END IF;

  RETURN NEW;
END;
$function$;