-- Belt-and-suspenders: prevent merchants from writing the orders.status column
-- directly via PostgREST. Status changes must go through admin_update_order_status
-- (SECURITY DEFINER) or service_role. The existing trigger already blocks it,
-- but revoking column privilege stops the attempt at the API layer.
REVOKE UPDATE (status) ON public.orders FROM authenticated;