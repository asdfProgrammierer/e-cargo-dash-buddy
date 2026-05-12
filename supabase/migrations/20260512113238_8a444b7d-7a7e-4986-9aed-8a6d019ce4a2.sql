
DROP TABLE IF EXISTS public.dhl_pricing CASCADE;

CREATE TABLE public.dhl_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL REFERENCES public.dhl_products(code) ON DELETE CASCADE,
  user_id uuid,
  max_weight_kg numeric(6,2) NOT NULL,
  price_netto numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dhl_tier_global_uniq
  ON public.dhl_price_tiers(product_code, max_weight_kg) WHERE user_id IS NULL;
CREATE UNIQUE INDEX dhl_tier_merchant_uniq
  ON public.dhl_price_tiers(product_code, user_id, max_weight_kg) WHERE user_id IS NOT NULL;

ALTER TABLE public.dhl_price_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage dhl_price_tiers" ON public.dhl_price_tiers
FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Merchants read own + global dhl_price_tiers" ON public.dhl_price_tiers
FOR SELECT TO authenticated
USING (user_id IS NULL OR user_id = merchant_owner_id(auth.uid()));

CREATE TRIGGER trg_dhl_price_tiers_updated BEFORE UPDATE ON public.dhl_price_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default-Staffeln (Preise = 0, vom Admin zu pflegen)
INSERT INTO public.dhl_price_tiers (product_code, user_id, max_weight_kg, price_netto) VALUES
 -- DHL Paket national: 1/3/5/10/20/31,5 kg
 ('V01PAK', NULL, 1, 0),('V01PAK', NULL, 3, 0),('V01PAK', NULL, 5, 0),
 ('V01PAK', NULL, 10, 0),('V01PAK', NULL, 20, 0),('V01PAK', NULL, 31.5, 0),
 -- Kleinpaket DE (max 1 kg)
 ('V62KP', NULL, 1, 0),
 -- Paket International (Standard-Staffeln 2/5/10/20/31,5)
 ('V53WPAK', NULL, 2, 0),('V53WPAK', NULL, 5, 0),('V53WPAK', NULL, 10, 0),
 ('V53WPAK', NULL, 20, 0),('V53WPAK', NULL, 31.5, 0),
 -- Paket EU
 ('V54EPAK', NULL, 2, 0),('V54EPAK', NULL, 5, 0),('V54EPAK', NULL, 10, 0),
 ('V54EPAK', NULL, 20, 0),('V54EPAK', NULL, 31.5, 0),
 -- Warenpost International (max 1 kg)
 ('V66KPI', NULL, 1, 0),
 -- Retoure (national)
 ('RETOURE', NULL, 31.5, 0);
