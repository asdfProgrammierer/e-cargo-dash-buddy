SELECT vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'), 'shopify_poll_cron_key', 'Cron key for shopify-poll-fulfilled');

CREATE OR REPLACE FUNCTION public.verify_shopify_poll_cron_key(_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'shopify_poll_cron_key' AND decrypted_secret = _key
  );
$$;

REVOKE ALL ON FUNCTION public.verify_shopify_poll_cron_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_shopify_poll_cron_key(text) TO service_role;