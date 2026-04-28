
ALTER TABLE public.route_stops ADD COLUMN IF NOT EXISTS delivery_note_pdf_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-notes', 'delivery-notes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins manage delivery notes"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'delivery-notes' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'delivery-notes' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Drivers read own delivery notes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-notes'
  AND EXISTS (
    SELECT 1 FROM public.route_stops rs
    JOIN public.routes r ON r.id = rs.route_id
    JOIN public.drivers d ON d.id = r.driver_id
    WHERE d.auth_user_id = auth.uid()
      AND (storage.foldername(storage.objects.name))[1] = 'orders'
      AND (storage.foldername(storage.objects.name))[2] = rs.order_id::text
  )
);

CREATE POLICY "Drivers upload own delivery notes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'delivery-notes'
  AND EXISTS (
    SELECT 1 FROM public.route_stops rs
    JOIN public.routes r ON r.id = rs.route_id
    JOIN public.drivers d ON d.id = r.driver_id
    WHERE d.auth_user_id = auth.uid()
      AND (storage.foldername(storage.objects.name))[1] = 'orders'
      AND (storage.foldername(storage.objects.name))[2] = rs.order_id::text
  )
);

CREATE POLICY "Drivers update own delivery notes"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'delivery-notes'
  AND EXISTS (
    SELECT 1 FROM public.route_stops rs
    JOIN public.routes r ON r.id = rs.route_id
    JOIN public.drivers d ON d.id = r.driver_id
    WHERE d.auth_user_id = auth.uid()
      AND (storage.foldername(storage.objects.name))[1] = 'orders'
      AND (storage.foldername(storage.objects.name))[2] = rs.order_id::text
  )
);

CREATE POLICY "Merchants read own delivery notes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-notes'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.user_id = auth.uid()
      AND (storage.foldername(storage.objects.name))[1] = 'orders'
      AND (storage.foldername(storage.objects.name))[2] = o.id::text
  )
);
