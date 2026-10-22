CREATE OR REPLACE FUNCTION public.admin_driver_time_stats(_driver_id uuid)
RETURNS TABLE(day date, total_seconds bigint, session_count integer, first_start timestamptz, last_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Nur Admins'; END IF;
  RETURN QUERY
  SELECT ((COALESCE(s.ended_at, now()) AT TIME ZONE 'Europe/Berlin'))::date,
    SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))))::bigint,
    COUNT(*)::int, MIN(s.started_at), MAX(COALESCE(s.ended_at, now()))
  FROM public.driver_work_sessions s
  WHERE s.driver_id = _driver_id
    AND s.started_at >= now() - interval '90 days'
    AND COALESCE(s.end_reason, '') <> 'auto_depot'
  GROUP BY 1 ORDER BY 1 DESC;
END; $$;