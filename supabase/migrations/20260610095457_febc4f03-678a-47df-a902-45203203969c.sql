-- Tighten drivers self-update: remove broad UPDATE policy, expose a narrow RPC
DROP POLICY IF EXISTS "Drivers can update own last_login" ON public.drivers;

CREATE OR REPLACE FUNCTION public.driver_touch_last_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.drivers
  SET last_login_at = now(),
      updated_at = now()
  WHERE auth_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.driver_touch_last_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_touch_last_login() TO authenticated;