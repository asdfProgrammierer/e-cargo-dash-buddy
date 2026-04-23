ALTER TABLE public.profiles
ADD COLUMN opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.orders
ADD COLUMN package_length_cm numeric,
ADD COLUMN package_width_cm numeric,
ADD COLUMN package_height_cm numeric;