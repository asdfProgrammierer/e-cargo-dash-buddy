
-- 1) Deletion tokens table (service-role only, no direct client access)
CREATE TABLE IF NOT EXISTS public.gdpr_deletion_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  requested_email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gdpr_deletion_tokens TO service_role;
ALTER TABLE public.gdpr_deletion_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role via edge functions may read/write.

CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_tokens_order ON public.gdpr_deletion_tokens (order_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_tokens_expires ON public.gdpr_deletion_tokens (expires_at);

-- 2) Reusable anonymization function (single source of truth)
CREATE OR REPLACE FUNCTION public.anonymize_order(_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  updated_id uuid;
BEGIN
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
         anonymized_at       = COALESCE(o.anonymized_at, now())
   WHERE o.id = _order_id
     AND o.anonymized_at IS NULL
  RETURNING o.id INTO updated_id;

  IF updated_id IS NULL THEN
    RETURN false;
  END IF;

  -- Delete signature/note/photo artefacts (folders keyed by order id)
  DELETE FROM storage.objects
   WHERE bucket_id IN ('delivery-signatures','delivery-notes','delivery-photos')
     AND split_part(name, '/', 1) = updated_id::text;

  -- Status history is part of the personal data — drop it for this order
  DELETE FROM public.order_status_history WHERE order_id = updated_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.anonymize_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_order(uuid) TO service_role;

-- 3) Extend the daily cleanup: use anonymize_order + prune old deletion tokens
CREATE OR REPLACE FUNCTION public.gdpr_cleanup_personal_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  rec record;
BEGIN
  -- 1) Anonymize orders older than 2 months in terminal states.
  FOR rec IN
    SELECT id
      FROM public.orders
     WHERE anonymized_at IS NULL
       AND status IN ('zugestellt', 'nicht_zugestellt', 'storniert')
       AND COALESCE(delivered_at, created_at) < now() - interval '2 months'
  LOOP
    PERFORM public.anonymize_order(rec.id);
  END LOOP;

  -- 2) Belt-and-suspenders storage cleanup for orphans.
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-signatures' AND created_at < now() - interval '2 months';
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-notes'      AND created_at < now() - interval '2 months';
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-photos'     AND created_at < now() - interval '2 months';

  -- 3) Other retention windows.
  DELETE FROM public.order_status_history       WHERE created_at < now() - interval '2 months';
  DELETE FROM public.email_send_log             WHERE created_at < now() - interval '90 days';
  DELETE FROM public.email_unsubscribe_tokens   WHERE created_at < now() - interval '30 days';
  DELETE FROM public.admin_audit_log            WHERE created_at < now() - interval '12 months';
  DELETE FROM public.gdpr_deletion_tokens       WHERE created_at < now() - interval '30 days';
END;
$function$;
