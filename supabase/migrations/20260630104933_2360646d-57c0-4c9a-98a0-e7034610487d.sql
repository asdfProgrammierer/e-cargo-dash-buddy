CREATE POLICY "Admins can view all address book entries" ON public.address_book FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert address book entries" ON public.address_book FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all address book entries" ON public.address_book FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete all address book entries" ON public.address_book FOR DELETE USING (public.has_role(auth.uid(), 'admin'));