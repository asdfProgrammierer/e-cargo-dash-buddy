
-- DHL Produkte (Stammdaten + Abrechnungsnummern)
CREATE TABLE public.dhl_products (
  code text PRIMARY KEY,
  label text NOT NULL,
  billing_number text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dhl_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage dhl_products" ON public.dhl_products
FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated read dhl_products" ON public.dhl_products
FOR SELECT TO authenticated USING (active = true);

INSERT INTO public.dhl_products (code,label,billing_number,sort_order) VALUES
 ('V01PAK','DHL Paket (DE)','63884302590102',10),
 ('V62KP','DHL Kleinpaket (DE)','63884302596202',20),
 ('V53WPAK','DHL Paket International','63884302595301',30),
 ('V54EPAK','DHL Paket EU','63884302595301',40),
 ('V66KPI','Warenpost International','63884302596601',50),
 ('RETOURE','DHL Retoure Online','63884302590702',60);

-- Preise (global default wenn user_id NULL, sonst Händler-Override)
CREATE TABLE public.dhl_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL REFERENCES public.dhl_products(code) ON DELETE CASCADE,
  user_id uuid,
  price_netto numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dhl_pricing_global_uniq ON public.dhl_pricing(product_code) WHERE user_id IS NULL;
CREATE UNIQUE INDEX dhl_pricing_merchant_uniq ON public.dhl_pricing(product_code,user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.dhl_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage dhl_pricing" ON public.dhl_pricing
FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Merchants read own + global dhl_pricing" ON public.dhl_pricing
FOR SELECT TO authenticated
USING (user_id IS NULL OR user_id = merchant_owner_id(auth.uid()));

CREATE TRIGGER trg_dhl_products_updated BEFORE UPDATE ON public.dhl_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dhl_pricing_updated BEFORE UPDATE ON public.dhl_pricing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Initiale globale Default-Preise (0 = noch nicht gepflegt)
INSERT INTO public.dhl_pricing (product_code, user_id, price_netto)
SELECT code, NULL, 0 FROM public.dhl_products;

-- Order: gewähltes Produkt + berechneter Preis speichern für Rechnung
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dhl_product_code text,
  ADD COLUMN IF NOT EXISTS dhl_price_netto numeric(10,2);
