
-- Cleanup function for GDPR data retention
CREATE OR REPLACE FUNCTION public.gdpr_cleanup_personal_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  -- 1. Order status history older than 2 months (contains order references)
  DELETE FROM public.order_status_history
  WHERE created_at < now() - interval '2 months';

  -- 2. Delivery signatures (storage) older than 2 months
  DELETE FROM storage.objects
  WHERE bucket_id = 'delivery-signatures'
    AND created_at < now() - interval '2 months';

  -- 3. Delivery notes / Lieferscheine (storage) older than 2 months
  DELETE FROM storage.objects
  WHERE bucket_id = 'delivery-notes'
    AND created_at < now() - interval '2 months';

  -- 4. Email send log older than 90 days (contains recipient email addresses)
  DELETE FROM public.email_send_log
  WHERE created_at < now() - interval '90 days';

  -- 5. Unsubscribe tokens older than 30 days (one-time use, no longer needed)
  DELETE FROM public.email_unsubscribe_tokens
  WHERE created_at < now() - interval '30 days';
END;
$$;

-- Ensure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Remove existing job if present (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('gdpr-cleanup-personal-data');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule daily cleanup at 03:15
SELECT cron.schedule(
  'gdpr-cleanup-personal-data',
  '15 3 * * *',
  $$SELECT public.gdpr_cleanup_personal_data();$$
);
