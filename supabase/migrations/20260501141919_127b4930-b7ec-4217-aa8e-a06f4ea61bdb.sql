CREATE OR REPLACE FUNCTION public.admin_get_pickup_cron_status()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  command text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen den Cron-Status einsehen';
  END IF;

  RETURN QUERY
  SELECT j.jobid, j.jobname, j.schedule, j.active, j.command
  FROM cron.job j
  WHERE j.jobname = 'generate-pickup-orders-daily';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_pickup_cron_runs(_limit integer DEFAULT 20)
RETURNS TABLE (
  runid bigint,
  jobid bigint,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  return_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen Cron-Läufe einsehen';
  END IF;

  RETURN QUERY
  SELECT r.runid, r.jobid, r.start_time, r.end_time, r.status, r.return_message
  FROM cron.job_run_details r
  JOIN cron.job j ON j.jobid = r.jobid
  WHERE j.jobname = 'generate-pickup-orders-daily'
  ORDER BY r.start_time DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_pickup_cron_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_pickup_cron_runs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_pickup_cron_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_pickup_cron_runs(integer) TO authenticated;