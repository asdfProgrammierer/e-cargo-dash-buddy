
-- Create orders table
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auftrags_nr text NOT NULL,
  absender_name text NOT NULL,
  absender_adresse text DEFAULT '',
  empfaenger_name text NOT NULL,
  empfaenger_adresse text DEFAULT '',
  empfaenger_plz text DEFAULT '',
  empfaenger_stadt text NOT NULL,
  empfaenger_email text,
  empfaenger_telefon text,
  pakete integer NOT NULL DEFAULT 1,
  gewicht numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'neu',
  notizen text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own orders
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders" ON public.orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own orders" ON public.orders
  FOR DELETE USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-generate auftrags_nr
CREATE OR REPLACE FUNCTION public.generate_auftrags_nr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_nr integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(auftrags_nr FROM 'EC-(\d+)') AS integer)), 0) + 1
  INTO next_nr
  FROM public.orders;
  NEW.auftrags_nr := 'EC-' || LPAD(next_nr::text, 7, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_auftrags_nr
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.auftrags_nr IS NULL OR NEW.auftrags_nr = '')
  EXECUTE FUNCTION public.generate_auftrags_nr();

-- DSGVO: Enable pg_cron and pg_net for auto-deletion after 2 months
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule daily cleanup of orders older than 2 months
SELECT cron.schedule(
  'delete-old-orders',
  '0 3 * * *',
  $$DELETE FROM public.orders WHERE created_at < now() - interval '2 months'$$
);
