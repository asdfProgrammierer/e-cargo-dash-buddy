ALTER TABLE public.vehicle_cost_items
  ADD COLUMN strompreis_kwh numeric CHECK (strompreis_kwh IS NULL OR strompreis_kwh >= 0),
  ADD COLUMN verbrauch_kwh_100km numeric CHECK (verbrauch_kwh_100km IS NULL OR verbrauch_kwh_100km >= 0);