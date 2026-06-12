CREATE OR REPLACE FUNCTION public.admin_resolve_undelivered_order(_order_id uuid, _action text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen diese Aktion ausführen';
  END IF;

  IF _action NOT IN ('retry', 'final') THEN
    RAISE EXCEPTION 'Ungültige Aktion';
  END IF;

  IF _action = 'retry' THEN
    UPDATE public.orders
    SET status = 'neu',
        delivery_unconfirmed = false,
        delivered_at = NULL,
        updated_at = now()
    WHERE id = _order_id
    RETURNING * INTO updated_order;
  ELSE
    UPDATE public.orders
    SET delivery_unconfirmed = false,
        updated_at = now()
    WHERE id = _order_id
    RETURNING * INTO updated_order;
  END IF;

  IF updated_order.id IS NULL THEN
    RAISE EXCEPTION 'Auftrag nicht gefunden';
  END IF;

  INSERT INTO public.order_status_history (order_id, user_id, status, reason, changed_by)
  VALUES (
    updated_order.id,
    updated_order.user_id,
    updated_order.status,
    CASE WHEN _action = 'retry'
      THEN 'Sendung wird erneut zugestellt'
      ELSE 'Zustellung leider nicht möglich'
    END,
    auth.uid()
  );

  RETURN updated_order;
END;
$$;