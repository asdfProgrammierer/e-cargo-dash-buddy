-- 2. Extend drivers table with login fields
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Enforce username format (lowercase, 3-32 chars) and uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS drivers_username_unique
  ON public.drivers (lower(username))
  WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_auth_user_id_unique
  ON public.drivers (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_username_format;
ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9._-]{3,32}$');

-- 3. Helper functions (security definer to bypass RLS recursion)
CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_route_driver(_route_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.routes r
    JOIN public.drivers d ON d.id = r.driver_id
    WHERE r.id = _route_id
      AND d.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_stop_route_driver(_stop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.route_stops rs
    JOIN public.routes r ON r.id = rs.route_id
    JOIN public.drivers d ON d.id = r.driver_id
    WHERE rs.id = _stop_id
      AND d.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_order_in_driver_route(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.route_stops rs
    JOIN public.routes r ON r.id = rs.route_id
    JOIN public.drivers d ON d.id = r.driver_id
    WHERE rs.order_id = _order_id
      AND d.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_depot_used_by_driver(_depot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.routes r
    JOIN public.drivers d ON d.id = r.driver_id
    WHERE (r.start_depot_id = _depot_id OR r.end_depot_id = _depot_id)
      AND d.auth_user_id = auth.uid()
  );
$$;

-- 4. RLS policies for drivers (own row)
DROP POLICY IF EXISTS "Drivers can view own driver row" ON public.drivers;
CREATE POLICY "Drivers can view own driver row"
ON public.drivers
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Drivers can update own last_login" ON public.drivers;
CREATE POLICY "Drivers can update own last_login"
ON public.drivers
FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- 5. RLS for routes
DROP POLICY IF EXISTS "Drivers can view assigned routes" ON public.routes;
CREATE POLICY "Drivers can view assigned routes"
ON public.routes
FOR SELECT
TO authenticated
USING (
  driver_id IS NOT NULL
  AND driver_id = public.current_driver_id()
);

-- 6. RLS for route_stops
DROP POLICY IF EXISTS "Drivers can view stops of own routes" ON public.route_stops;
CREATE POLICY "Drivers can view stops of own routes"
ON public.route_stops
FOR SELECT
TO authenticated
USING (public.is_route_driver(route_id));

DROP POLICY IF EXISTS "Drivers can update stops of own routes" ON public.route_stops;
CREATE POLICY "Drivers can update stops of own routes"
ON public.route_stops
FOR UPDATE
TO authenticated
USING (public.is_route_driver(route_id))
WITH CHECK (public.is_route_driver(route_id));

-- 7. RLS for orders (driver can see + update orders that are in own route)
DROP POLICY IF EXISTS "Drivers can view orders of own routes" ON public.orders;
CREATE POLICY "Drivers can view orders of own routes"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_order_in_driver_route(id));

DROP POLICY IF EXISTS "Drivers can update orders of own routes" ON public.orders;
CREATE POLICY "Drivers can update orders of own routes"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.is_order_in_driver_route(id))
WITH CHECK (public.is_order_in_driver_route(id));

-- 8. RLS for depots
DROP POLICY IF EXISTS "Drivers can view depots of own routes" ON public.depots;
CREATE POLICY "Drivers can view depots of own routes"
ON public.depots
FOR SELECT
TO authenticated
USING (public.is_depot_used_by_driver(id));
