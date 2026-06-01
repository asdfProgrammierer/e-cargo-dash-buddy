-- Add delivery photo column
ALTER TABLE public.route_stops
  ADD COLUMN IF NOT EXISTS delivery_photo_url text;

-- Create private storage bucket for delivery photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-photos', 'delivery-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: only service role + admins can read/write directly
CREATE POLICY "Admins can read delivery photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'delivery-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Drivers can read photos of own stops"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-photos'
  AND EXISTS (
    SELECT 1 FROM public.route_stops rs
    JOIN public.routes r ON r.id = rs.route_id
    JOIN public.drivers d ON d.id = r.driver_id
    WHERE d.auth_user_id = auth.uid()
      AND rs.delivery_photo_url = storage.objects.name
  )
);

-- GDPR: include delivery photos in 2-month cleanup
CREATE OR REPLACE FUNCTION public.gdpr_cleanup_personal_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
BEGIN
  DELETE FROM public.order_status_history WHERE created_at < now() - interval '2 months';
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-signatures' AND created_at < now() - interval '2 months';
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-notes' AND created_at < now() - interval '2 months';
  DELETE FROM storage.objects WHERE bucket_id = 'delivery-photos' AND created_at < now() - interval '2 months';
  DELETE FROM public.email_send_log WHERE created_at < now() - interval '90 days';
  DELETE FROM public.email_unsubscribe_tokens WHERE created_at < now() - interval '30 days';
END;
$function$;