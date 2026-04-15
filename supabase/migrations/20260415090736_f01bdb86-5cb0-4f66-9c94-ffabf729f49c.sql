
CREATE TABLE public.shop_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL DEFAULT '',
  api_url text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  webhook_secret text,
  active boolean NOT NULL DEFAULT false,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage shop_connections"
  ON public.shop_connections
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_shop_connections_updated_at
  BEFORE UPDATE ON public.shop_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
