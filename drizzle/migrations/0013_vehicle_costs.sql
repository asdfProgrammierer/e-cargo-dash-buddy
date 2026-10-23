ALTER TABLE public.vehicles
  ADD COLUMN fixkosten_monat numeric NOT NULL DEFAULT 0 CHECK (fixkosten_monat >= 0),
  ADD COLUMN kosten_pro_km numeric NOT NULL DEFAULT 0 CHECK (kosten_pro_km >= 0);