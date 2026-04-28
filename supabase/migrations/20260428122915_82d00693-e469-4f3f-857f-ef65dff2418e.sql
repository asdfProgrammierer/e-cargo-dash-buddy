-- Add proof-of-delivery fields to route_stops
ALTER TABLE public.route_stops
  ADD COLUMN IF NOT EXISTS delivery_mode text,
  ADD COLUMN IF NOT EXISTS delivery_note text,
  ADD COLUMN IF NOT EXISTS delivery_recipient text,
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Create private bucket for signatures
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-signatures', 'delivery-signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
-- Admins: full access
CREATE POLICY "Admins manage delivery signatures"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'delivery-signatures' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'delivery-signatures' AND public.has_role(auth.uid(), 'admin'));

-- Drivers: upload + read for stops on their own routes
-- Path convention: stops/<stop_id>/<filename>
CREATE POLICY "Drivers upload signatures for own stops"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-signatures'
  AND (storage.foldername(name))[1] = 'stops'
  AND public.is_stop_route_driver( ((storage.foldername(name))[2])::uuid )
);

CREATE POLICY "Drivers read signatures for own stops"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-signatures'
  AND (storage.foldername(name))[1] = 'stops'
  AND public.is_stop_route_driver( ((storage.foldername(name))[2])::uuid )
);

-- Merchants: read signatures for their own orders (path includes order id at level 4)
-- Path convention: stops/<stop_id>/orders/<order_id>/<filename>
CREATE POLICY "Merchants read signatures for own orders"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-signatures'
  AND (storage.foldername(name))[3] = 'orders'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = ((storage.foldername(name))[4])::uuid
      AND o.user_id = auth.uid()
  )
);