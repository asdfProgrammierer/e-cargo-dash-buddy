CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  label text NOT NULL,
  color text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT delivery_zones_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT delivery_zones_label_not_blank CHECK (btrim(label) <> ''),
  CONSTRAINT delivery_zones_label_length CHECK (char_length(label) <= 24)
);

CREATE TABLE public.delivery_zone_postcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  postcode text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT delivery_zone_postcodes_postcode_format CHECK (postcode ~ '^[0-9]{5}$'),
  CONSTRAINT delivery_zone_postcodes_postcode_unique UNIQUE (postcode)
);

CREATE INDEX delivery_zones_sort_order_idx ON public.delivery_zones(sort_order, name);
CREATE INDEX delivery_zone_postcodes_zone_id_idx ON public.delivery_zone_postcodes(zone_id);

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zone_postcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage delivery zones"
ON public.delivery_zones
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view active delivery zones"
ON public.delivery_zones
FOR SELECT
TO authenticated
USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage delivery zone postcodes"
ON public.delivery_zone_postcodes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view delivery zone postcodes"
ON public.delivery_zone_postcodes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.delivery_zones dz
    WHERE dz.id = zone_id
      AND (dz.active = true OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE TRIGGER update_delivery_zones_updated_at
BEFORE UPDATE ON public.delivery_zones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();