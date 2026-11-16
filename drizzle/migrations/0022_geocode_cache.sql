CREATE OR REPLACE FUNCTION public.geocode_cache_key(_street text, _plz text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(
           regexp_replace(lower(coalesce(_street,'')), '(straße|strasse|str\.?)', 'str', 'g'),
           '[^a-z0-9äöü]', '', 'g')
         || '|' || regexp_replace(coalesce(_plz,''), '\D', '', 'g')
$$;

CREATE TABLE public.geocode_cache (
  address_key text PRIMARY KEY,
  strasse text,
  plz text,
  stadt text,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'geocoder',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.geocode_cache TO authenticated;
GRANT ALL ON public.geocode_cache TO service_role;
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read geocode cache" ON public.geocode_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.geocode_cache (address_key, strasse, plz, stadt, lat, lng, source)
SELECT DISTINCT ON (k) k, empfaenger_adresse, trim(empfaenger_plz), empfaenger_stadt, lat, lng, 'history'
FROM (
  SELECT public.geocode_cache_key(empfaenger_adresse, empfaenger_plz) k, *
  FROM public.orders
  WHERE lat IS NOT NULL AND lng IS NOT NULL AND coalesce(geocode_quality,'exact') = 'exact'
    AND empfaenger_adresse ~ '\d' AND coalesce(empfaenger_plz,'') ~ '\d{5}'
) s
ORDER BY k, geocoded_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

UPDATE public.orders o
SET lat = c.lat, lng = c.lng, geocoded_at = now(), geocode_quality = 'exact', geocode_note = 'Aus Adress-Speicher'
FROM public.geocode_cache c
WHERE o.lat IS NULL AND o.status = 'neu'
  AND c.address_key = public.geocode_cache_key(o.empfaenger_adresse, o.empfaenger_plz);