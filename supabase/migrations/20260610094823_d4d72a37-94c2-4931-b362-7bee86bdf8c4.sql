
-- 1) Restrict sensitive columns on shop_connections from regular authenticated users
REVOKE SELECT (api_key, webhook_secret) ON public.shop_connections FROM authenticated;
REVOKE UPDATE (api_key, webhook_secret) ON public.shop_connections FROM authenticated;
-- service_role retains full access via GRANT ALL; admins must use admin_get_shop_connection() RPC

-- 2) Restrict driver self-update to last_login_at only
CREATE OR REPLACE FUNCTION public.prevent_driver_self_column_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role'
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.telefon IS DISTINCT FROM OLD.telefon
     OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.fuehrerscheinklasse IS DISTINCT FROM OLD.fuehrerscheinklasse
     OR NEW.vorname IS DISTINCT FROM OLD.vorname
     OR NEW.nachname IS DISTINCT FROM OLD.nachname
     OR NEW.notizen IS DISTINCT FROM OLD.notizen
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Driver may only update last_login_at on their own row';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_driver_self_column_change_trg ON public.drivers;
CREATE TRIGGER prevent_driver_self_column_change_trg
BEFORE UPDATE ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_driver_self_column_change();

-- 3) Allow admins to delete delivery photos for cleanup
DROP POLICY IF EXISTS "Admins can delete delivery photos" ON storage.objects;
CREATE POLICY "Admins can delete delivery photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'delivery-photos' AND public.has_role(auth.uid(), 'admin'));
