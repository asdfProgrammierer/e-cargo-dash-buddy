DROP POLICY IF EXISTS "Users manage own reads" ON public.notification_reads;

CREATE POLICY "Users can view own notification reads"
ON public.notification_reads
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create own notification reads"
ON public.notification_reads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.id = notification_id
      AND (
        n.audience = 'all'
        OR n.target_user_id = public.merchant_owner_id(auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

CREATE POLICY "Users can delete own notification reads"
ON public.notification_reads
FOR DELETE
TO authenticated
USING (user_id = auth.uid());