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
DECLARE
  target_jobid bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen Cron-Läufe einsehen';
  END IF;

  SELECT j.jobid INTO target_jobid
  FROM cron.job j
  WHERE j.jobname = 'generate-pickup-orders-daily'
  LIMIT 1;

  IF target_jobid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.runid, r.jobid, r.start_time, r.end_time, r.status, r.return_message
  FROM cron.job_run_details r
  WHERE r.jobid = target_jobid
    AND r.start_time > now() - interval '24 hours'
  ORDER BY r.start_time DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
END;
$$;