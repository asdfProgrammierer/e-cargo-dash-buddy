-- Erlaubt "Alle"-Zeitraum: p_from/p_to sind optional, NULL bedeutet kein Zeitraumsfilter.
CREATE OR REPLACE FUNCTION public.admin_delivery_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_merchant_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins';
  END IF;

  WITH
  base AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.status <> 'storniert'
      AND o.is_pickup = false
      AND (p_merchant_ids IS NULL OR o.user_id = ANY(p_merchant_ids))
      AND (
        p_from IS NULL OR p_to IS NULL
        OR (o.delivered_at IS NOT NULL AND o.delivered_at >= p_from AND o.delivered_at < p_to)
        OR (o.delivered_at IS NULL AND o.created_at >= p_from AND o.created_at < p_to)
      )
  ),
  delivered AS (
    SELECT * FROM base WHERE status = 'zugestellt' AND delivered_at IS NOT NULL
  ),
  kpis AS (
    SELECT
      (SELECT COUNT(*) FROM base) AS total,
      (SELECT COUNT(*) FROM delivered) AS delivered_cnt,
      (SELECT COUNT(*) FROM delivered WHERE COALESCE(delivery_attempts,0) <= 1) AS first_try_cnt,
      (SELECT AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))/3600.0) FROM delivered) AS avg_hours,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (delivered_at - created_at))/3600.0)
       FROM delivered) AS median_hours
  ),
  plz_agg AS (
    SELECT
      NULLIF(TRIM(empfaenger_plz), '') AS plz,
      empfaenger_stadt AS stadt,
      SUM(pakete)::int AS pakete,
      COUNT(*)::int AS auftraege,
      AVG(lat)::float AS lat,
      AVG(lng)::float AS lng
    FROM delivered
    WHERE lat IS NOT NULL AND lng IS NOT NULL
    GROUP BY NULLIF(TRIM(empfaenger_plz), ''), empfaenger_stadt
    HAVING NULLIF(TRIM(empfaenger_plz), '') IS NOT NULL
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT to_jsonb(kpis) FROM kpis),
    'heatmap', COALESCE((SELECT jsonb_agg(to_jsonb(plz_agg)) FROM plz_agg), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delivery_stats(timestamptz, timestamptz, uuid[]) TO authenticated;