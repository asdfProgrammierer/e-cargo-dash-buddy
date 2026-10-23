CREATE OR REPLACE FUNCTION public.anonymize_order(_order_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE updated_id uuid;
BEGIN
  UPDATE public.orders o
     SET empfaenger_name = 'anonymisiert',
         empfaenger_adresse = NULL,
         empfaenger_email = NULL,
         empfaenger_telefon = NULL,
         absender_name = CASE WHEN o.is_pickup THEN o.absender_name ELSE 'anonymisiert' END,
         absender_adresse = CASE WHEN o.is_pickup THEN o.absender_adresse ELSE NULL END,
         notizen = NULL, lat = NULL, lng = NULL,
         dhl_label_url = NULL, tracking_token = NULL,
         anonymized_at = COALESCE(o.anonymized_at, now())
   WHERE o.id = _order_id AND o.anonymized_at IS NULL
  RETURNING o.id INTO updated_id;
  IF updated_id IS NULL THEN RETURN false; END IF;
  DELETE FROM public.order_status_history WHERE order_id = updated_id;
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.gdpr_cleanup_personal_data()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT id FROM public.orders
     WHERE anonymized_at IS NULL
       AND status IN ('zugestellt','nicht_zugestellt','storniert')
       AND COALESCE(delivered_at, created_at) < now() - interval '2 months'
  LOOP
    BEGIN
      PERFORM public.anonymize_order(rec.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.admin_audit_log (actor_role, entity_type, entity_id, action, metadata)
      VALUES ('system','order',rec.id::text,'anonymize_failed', jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
  DELETE FROM public.order_status_history     WHERE created_at < now() - interval '2 months';
  DELETE FROM public.email_send_log           WHERE created_at < now() - interval '90 days';
  DELETE FROM public.email_unsubscribe_tokens WHERE created_at < now() - interval '30 days';
  DELETE FROM public.admin_audit_log          WHERE created_at < now() - interval '12 months';
  DELETE FROM public.gdpr_deletion_tokens     WHERE created_at < now() - interval '30 days';
END; $function$;

REVOKE ALL ON FUNCTION public.anonymize_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gdpr_cleanup_personal_data() FROM PUBLIC, anon, authenticated;