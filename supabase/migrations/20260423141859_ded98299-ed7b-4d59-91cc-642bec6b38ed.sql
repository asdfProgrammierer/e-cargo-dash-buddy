CREATE TABLE public.order_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_order_status_history_order_id_created_at
ON public.order_status_history (order_id, created_at DESC);

CREATE INDEX idx_order_status_history_user_id
ON public.order_status_history (user_id);

CREATE POLICY "Users can view own order history"
ON public.order_status_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all order history"
ON public.order_status_history
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert order history"
ON public.order_status_history
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  _order_id UUID,
  _status TEXT,
  _reason TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_order public.orders%ROWTYPE;
  normalized_reason TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen Bestellstatus ändern';
  END IF;

  IF _status NOT IN ('neu', 'in_bearbeitung', 'unterwegs', 'zugestellt', 'nicht_zugestellt', 'storniert') THEN
    RAISE EXCEPTION 'Ungültiger Bestellstatus';
  END IF;

  normalized_reason := NULLIF(BTRIM(_reason), '');

  IF _status = 'nicht_zugestellt' AND normalized_reason IS NULL THEN
    RAISE EXCEPTION 'Für Nicht Zugestellt ist ein Grund erforderlich';
  END IF;

  UPDATE public.orders
  SET status = _status,
      updated_at = now()
  WHERE id = _order_id
  RETURNING * INTO updated_order;

  IF updated_order.id IS NULL THEN
    RAISE EXCEPTION 'Auftrag nicht gefunden';
  END IF;

  IF _status = 'nicht_zugestellt' THEN
    INSERT INTO public.order_status_history (order_id, user_id, status, reason, changed_by)
    VALUES (updated_order.id, updated_order.user_id, _status, normalized_reason, auth.uid());
  END IF;

  RETURN updated_order;
END;
$$;