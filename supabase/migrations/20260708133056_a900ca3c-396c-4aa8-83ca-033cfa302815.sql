
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_anonymize_candidates
  ON public.orders (status, delivered_at, created_at)
  WHERE anonymized_at IS NULL;

CREATE OR REPLACE FUNCTION public.gdpr_cleanup_personal_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  anonymized_ids uuid[];
BEGIN
  -- 1) Anonymize orders older than 2 months that are in a terminal state.
  --    Keep: id, user_id, auftrags_nr, empfaenger_plz, status, is_pickup,
  --    pakete, gewicht, delivery_attempts, created_at, updated_at, delivered_at.
  WITH candidates AS (
    SELECT id
    FROM public.orders
    WHERE anonymized_at IS NULL
      AND status IN ('zugestellt', 'nicht_zugestellt', 'storniert')
      AND COALESCE(delivered_at, created_at) < now() - interval '2 months'
  ),
  updated AS (
    UPDATE public.orders o
       SET empfaenger_name     = 'anonymisiert',
           empfaenger_adresse  = NULL,
           empfaenger_stadt    = NULL,
           empfaenger_email    = NULL,
           empfaenger_telefon  = NULL,
           absender_name       = CASE WHEN o.is_pickup THEN o.absender_name ELSE NULL END,
           absender_adresse    = CASE WHEN o.is_pickup THEN o.absender_adresse ELSE NULL END,
           notizen             = NULL,
           lat                 = NULL,
           lng                 = NULL,
           dhl_label_url       = NULL,
           tracking_token      = NULL,
           anonymized_at       = now()
     WHERE o.id IN (SELECT id FROM candidates)
    RETURNING o.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO anonymized_ids FROM updated;

  -- 2) Delete storage artefacts for these orders (folders keyed by order id).
  IF array_length(anonymized_ids, 1) IS NOT NULL THEN
    DELETE FROM storage.objects
     WHERE bucket_id IN ('delivery-signatures','delivery-notes','delivery-photos')
       AND split_part(name, '/', 1) = ANY (anonymized_ids::text[]);
  END IF;

  -- 3) Legacy time-based storage cleanup (belt & suspenders for orphans).
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-signatures' AND created_at < now() - interval '2 months';
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-notes'      AND created_at < now() - interval '2 months';
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-photos'     AND created_at < now() - interval '2 months';

  -- 4) Other retention windows.
  DELETE FROM public.order_status_history       WHERE created_at < now() - interval '2 months';
  DELETE FROM public.email_send_log             WHERE created_at < now() - interval '90 days';
  DELETE FROM public.email_unsubscribe_tokens   WHERE created_at < now() - interval '30 days';
  DELETE FROM public.admin_audit_log            WHERE created_at < now() - interval '12 months';
END;
$function$;
