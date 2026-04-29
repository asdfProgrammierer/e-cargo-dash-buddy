ALTER TABLE public.orders DISABLE TRIGGER enforce_admin_order_status_change;

UPDATE public.orders o
SET status = 'unterwegs', updated_at = now()
FROM public.route_stops rs
JOIN public.routes r ON r.id = rs.route_id
WHERE rs.order_id = o.id
  AND r.status IN ('aktiv', 'abgeschlossen')
  AND o.status IN ('neu', 'in_bearbeitung');

ALTER TABLE public.orders ENABLE TRIGGER enforce_admin_order_status_change;