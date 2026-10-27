CREATE TABLE public.tracking_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tracking_rate_limits TO service_role;
ALTER TABLE public.tracking_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.tracking_rate_limits;
BEGIN
  INSERT INTO public.tracking_rate_limits AS t (key, count, window_start)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN t.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE t.count + 1 END,
    window_start = CASE WHEN t.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE t.window_start END
  RETURNING * INTO r;
  IF random() < 0.02 THEN
    DELETE FROM public.tracking_rate_limits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN jsonb_build_object(
    'allowed', r.count <= p_max,
    'retry_after', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.window_start + make_interval(secs => p_window_seconds) - now()))))::int
  );
END; $$;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;