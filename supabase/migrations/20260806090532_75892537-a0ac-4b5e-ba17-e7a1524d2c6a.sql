CREATE TABLE public.wms_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  merchant_code TEXT NOT NULL,
  label TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wms_api_keys TO authenticated;
GRANT ALL ON public.wms_api_keys TO service_role;

ALTER TABLE public.wms_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view wms api keys"
  ON public.wms_api_keys FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert wms api keys"
  ON public.wms_api_keys FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update wms api keys"
  ON public.wms_api_keys FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete wms api keys"
  ON public.wms_api_keys FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_wms_api_keys_hash ON public.wms_api_keys (key_hash);
CREATE INDEX idx_wms_api_keys_user ON public.wms_api_keys (user_id);

CREATE TRIGGER update_wms_api_keys_updated_at
  BEFORE UPDATE ON public.wms_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();