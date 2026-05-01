CREATE TABLE IF NOT EXISTS public.pickup_cron_settings (
  id integer PRIMARY KEY DEFAULT 1,
  deadline_hour smallint NOT NULL DEFAULT 14,
  deadline_minute smallint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pickup_cron_settings_singleton CHECK (id = 1),
  CONSTRAINT pickup_cron_settings_hour_range CHECK (deadline_hour BETWEEN 0 AND 23),
  CONSTRAINT pickup_cron_settings_minute_range CHECK (deadline_minute BETWEEN 0 AND 59)
);

INSERT INTO public.pickup_cron_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pickup_cron_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view pickup cron settings"
  ON public.pickup_cron_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update pickup cron settings"
  ON public.pickup_cron_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_set_pickup_deadline(_hour smallint, _minute smallint)
RETURNS public.pickup_cron_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.pickup_cron_settings%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen die Deadline ändern';
  END IF;

  IF _hour < 0 OR _hour > 23 THEN
    RAISE EXCEPTION 'Stunde muss zwischen 0 und 23 liegen';
  END IF;

  IF _minute < 0 OR _minute > 59 THEN
    RAISE EXCEPTION 'Minute muss zwischen 0 und 59 liegen';
  END IF;

  UPDATE public.pickup_cron_settings
  SET deadline_hour = _hour,
      deadline_minute = _minute,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = 1
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_pickup_deadline(smallint, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pickup_deadline(smallint, smallint) TO authenticated;