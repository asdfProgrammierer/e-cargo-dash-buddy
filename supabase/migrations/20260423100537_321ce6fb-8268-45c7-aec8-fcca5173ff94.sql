ALTER TABLE public.profiles
ADD COLUMN paketpreis numeric(10,2);

ALTER TABLE public.orders
ADD COLUMN delivered_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.sync_order_delivered_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'zugestellt' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'zugestellt' THEN
      NEW.delivered_at = COALESCE(NEW.delivered_at, now());
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'zugestellt' AND NEW.status IS DISTINCT FROM 'zugestellt' THEN
    NEW.delivered_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_order_delivered_at_on_orders ON public.orders;

CREATE TRIGGER sync_order_delivered_at_on_orders
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_delivered_at();

CREATE INDEX IF NOT EXISTS idx_orders_user_delivered_at
ON public.orders (user_id, delivered_at)
WHERE delivered_at IS NOT NULL;