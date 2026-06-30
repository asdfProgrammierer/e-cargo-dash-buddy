
-- 1. Table
CREATE TABLE public.driver_work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  start_depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  end_depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  duration_seconds integer GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NULL THEN NULL
         ELSE GREATEST(0, EXTRACT(EPOCH FROM (ended_at - started_at))::integer)
    END
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_work_sessions_end_reason_chk
    CHECK (end_reason IS NULL OR end_reason IN ('auto_depot','manual','route_completed','timeout'))
);

CREATE INDEX driver_work_sessions_driver_started_idx
  ON public.driver_work_sessions (driver_id, started_at DESC);
CREATE UNIQUE INDEX driver_work_sessions_one_open_per_driver
  ON public.driver_work_sessions (driver_id) WHERE ended_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.driver_work_sessions TO authenticated;
GRANT ALL ON public.driver_work_sessions TO service_role;

ALTER TABLE public.driver_work_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all work sessions"
  ON public.driver_work_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Drivers read own work sessions"
  ON public.driver_work_sessions FOR SELECT TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE TRIGGER trg_driver_work_sessions_updated_at
  BEFORE UPDATE ON public.driver_work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RPC: start
CREATE OR REPLACE FUNCTION public.driver_start_work_session(_route_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_id uuid;
  r record;
  new_id uuid;
BEGIN
  SELECT id INTO d_id FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1;
  IF d_id IS NULL THEN RAISE EXCEPTION 'Not a driver'; END IF;

  SELECT start_depot_id, end_depot_id, driver_id INTO r FROM public.routes WHERE id = _route_id;
  IF NOT FOUND OR r.driver_id IS DISTINCT FROM d_id THEN
    RAISE EXCEPTION 'Route nicht gefunden oder nicht zugewiesen';
  END IF;

  -- Falls schon eine offene Session läuft, weiterverwenden
  SELECT id INTO new_id FROM public.driver_work_sessions
   WHERE driver_id = d_id AND ended_at IS NULL LIMIT 1;
  IF new_id IS NOT NULL THEN RETURN new_id; END IF;

  INSERT INTO public.driver_work_sessions (driver_id, route_id, start_depot_id, end_depot_id)
  VALUES (d_id, _route_id, r.start_depot_id, COALESCE(r.end_depot_id, r.start_depot_id))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- 3. RPC: end
CREATE OR REPLACE FUNCTION public.driver_end_work_session(_reason text DEFAULT 'manual')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE d_id uuid;
BEGIN
  SELECT id INTO d_id FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1;
  IF d_id IS NULL THEN RAISE EXCEPTION 'Not a driver'; END IF;
  IF _reason NOT IN ('auto_depot','manual','route_completed','timeout') THEN
    _reason := 'manual';
  END IF;
  UPDATE public.driver_work_sessions
     SET ended_at = now(), end_reason = _reason
   WHERE driver_id = d_id AND ended_at IS NULL;
END;
$$;

-- 4. Haversine helper
CREATE OR REPLACE FUNCTION public.haversine_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE
AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    sin(radians((lat2 - lat1)/2))^2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians((lon2 - lon1)/2))^2
  ));
$$;

-- 5. Replace driver_update_location with auto-end logic
CREATE OR REPLACE FUNCTION public.driver_update_location(_lat double precision, _lng double precision, _accuracy double precision DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_id uuid;
  sess record;
  dep record;
BEGIN
  SELECT id INTO d_id FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1;
  IF d_id IS NULL THEN RAISE EXCEPTION 'Not a driver'; END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'Invalid coordinates';
  END IF;

  INSERT INTO public.driver_locations (driver_id, lat, lng, accuracy, updated_at)
  VALUES (d_id, _lat, _lng, _accuracy, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
        accuracy = EXCLUDED.accuracy, updated_at = now();

  -- Auto-end work session on depot arrival (>=2 min after start to avoid instant close)
  SELECT s.id, s.end_depot_id, s.started_at
    INTO sess
    FROM public.driver_work_sessions s
   WHERE s.driver_id = d_id AND s.ended_at IS NULL
   LIMIT 1;
  IF sess.id IS NOT NULL AND sess.end_depot_id IS NOT NULL
     AND sess.started_at < now() - interval '2 minutes' THEN
    SELECT lat, lng INTO dep FROM public.depots WHERE id = sess.end_depot_id;
    IF dep.lat IS NOT NULL AND dep.lng IS NOT NULL
       AND public.haversine_m(_lat, _lng, dep.lat::double precision, dep.lng::double precision) <= 150 THEN
      UPDATE public.driver_work_sessions
         SET ended_at = now(), end_reason = 'auto_depot'
       WHERE id = sess.id;
    END IF;
  END IF;
END;
$$;

-- 6. Admin stats RPC
CREATE OR REPLACE FUNCTION public.admin_driver_time_stats(_driver_id uuid)
RETURNS TABLE(
  day date,
  total_seconds bigint,
  session_count integer,
  first_start timestamptz,
  last_end timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins';
  END IF;
  RETURN QUERY
  SELECT
    ((COALESCE(s.ended_at, now()) AT TIME ZONE 'Europe/Berlin'))::date AS day,
    SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))))::bigint AS total_seconds,
    COUNT(*)::int AS session_count,
    MIN(s.started_at) AS first_start,
    MAX(COALESCE(s.ended_at, now())) AS last_end
  FROM public.driver_work_sessions s
  WHERE s.driver_id = _driver_id
    AND s.started_at >= now() - interval '90 days'
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$$;

-- 7. Cleanup function for runaway sessions (>14h)
CREATE OR REPLACE FUNCTION public.cleanup_stale_work_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.driver_work_sessions
     SET ended_at = started_at + interval '14 hours',
         end_reason = 'timeout'
   WHERE ended_at IS NULL
     AND started_at < now() - interval '14 hours';
$$;
