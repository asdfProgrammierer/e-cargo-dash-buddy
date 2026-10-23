ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stopppreis numeric CHECK (stopppreis IS NULL OR stopppreis >= 0),
  ADD COLUMN IF NOT EXISTS stundenpreis numeric CHECK (stundenpreis IS NULL OR stundenpreis >= 0),
  ADD COLUMN IF NOT EXISTS tagespauschale numeric CHECK (tagespauschale IS NULL OR tagespauschale >= 0),
  ADD COLUMN IF NOT EXISTS grundbeitrag_monat numeric CHECK (grundbeitrag_monat IS NULL OR grundbeitrag_monat >= 0);
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS hourly_wage numeric CHECK (hourly_wage IS NULL OR hourly_wage >= 0);
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS exclusive_merchant_user_id uuid;