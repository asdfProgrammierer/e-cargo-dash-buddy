-- Defense-in-depth: re-assert column-level revokes on shop_connections secrets
REVOKE SELECT (api_key, webhook_secret) ON public.shop_connections FROM anon, authenticated, PUBLIC;

-- Harden merchant_owner_id(): return NULL for drivers so they can never
-- accidentally satisfy merchant-scoped RLS policies via auth.uid() fallback.
CREATE OR REPLACE FUNCTION public.merchant_owner_id(_uid uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.drivers d WHERE d.auth_user_id = _uid)
      THEN NULL
    ELSE COALESCE(
      (SELECT p.parent_user_id FROM public.profiles p WHERE p.user_id = _uid LIMIT 1),
      _uid
    )
  END;
$function$;