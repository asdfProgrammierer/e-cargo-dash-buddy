UPDATE public.shop_connections
SET poll_sync_enabled = true,
    shop_domain = COALESCE(shop_domain, api_url),
    poll_watermark_at = COALESCE(poll_watermark_at, now()),
    webhook_cutoff_at = COALESCE(webhook_cutoff_at, now())
WHERE platform = 'shopify' AND active = true;