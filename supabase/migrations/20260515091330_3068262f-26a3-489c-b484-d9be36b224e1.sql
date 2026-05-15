CREATE POLICY "Admins can insert orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));