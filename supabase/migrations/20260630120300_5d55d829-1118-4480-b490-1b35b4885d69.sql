
-- Remove the broad admin ALL policy that could expose api_key/webhook_secret
-- via direct PostgREST access if column-level grants were ever loosened.
DROP POLICY IF EXISTS "Admins can manage shop_connections" ON public.shop_connections;

-- Admin upsert RPC (replaces direct INSERT/UPDATE from admin UI).
CREATE OR REPLACE FUNCTION public.admin_upsert_shop_connection(
  _user_id uuid,
  _platform text,
  _api_url text,
  _api_key text,
  _active boolean,
  _notizen text DEFAULT NULL
)
RETURNS public.shop_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.shop_connections;
  existing_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen Shop-Verbindungen verwalten';
  END IF;

  IF _user_id IS NULL OR _platform IS NULL OR btrim(_platform) = '' THEN
    RAISE EXCEPTION 'Ungültige Eingabe';
  END IF;

  SELECT id INTO existing_id
  FROM public.shop_connections
  WHERE user_id = _user_id AND platform = _platform
  LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.shop_connections (user_id, platform, api_url, api_key, active, notizen)
    VALUES (_user_id, _platform, _api_url, _api_key, COALESCE(_active, false), NULLIF(btrim(_notizen), ''))
    RETURNING * INTO result;
  ELSE
    UPDATE public.shop_connections
    SET api_url = _api_url,
        api_key = _api_key,
        active = COALESCE(_active, false),
        notizen = NULLIF(btrim(_notizen), ''),
        updated_at = now()
    WHERE id = existing_id
    RETURNING * INTO result;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_shop_connection(uuid, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_shop_connection(uuid, text, text, text, boolean, text) TO authenticated;

-- Admin delete RPC (replaces direct DELETE from admin UI).
CREATE OR REPLACE FUNCTION public.admin_delete_shop_connection(_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen Shop-Verbindungen löschen';
  END IF;
  DELETE FROM public.shop_connections WHERE id = _connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_shop_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_shop_connection(uuid) TO authenticated;
