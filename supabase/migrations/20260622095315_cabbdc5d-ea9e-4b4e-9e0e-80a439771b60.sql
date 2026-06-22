
-- 1) driver_locations: explicit driver INSERT/UPDATE policies scoped to own row
CREATE POLICY "Driver inserts own location"
  ON public.driver_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "Driver updates own location"
  ON public.driver_locations
  FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

-- 2) drivers: explicit driver UPDATE policy for own row.
-- Column-level enforcement is handled by trigger prevent_driver_self_column_change.
CREATE POLICY "Driver updates own driver row"
  ON public.drivers
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 3) shop_connections: revoke column-level SELECT of secrets from merchants/authenticated.
-- Admins keep full access via the "Admins can manage shop_connections" policy and table-level GRANT.
-- Edge functions use service_role and are unaffected.
REVOKE SELECT (api_key, webhook_secret) ON public.shop_connections FROM authenticated;
REVOKE SELECT (api_key, webhook_secret) ON public.shop_connections FROM anon;
