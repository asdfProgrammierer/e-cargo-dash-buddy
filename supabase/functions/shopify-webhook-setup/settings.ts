export function normalizeShopDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let domain = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : null;
}

export function settingsUpdate(body: { shopDomain?: string; appSecret?: string }) {
  const update: { shop_domain?: string; webhook_secret?: string } = {};
  if (body.shopDomain !== undefined) {
    const domain = normalizeShopDomain(body.shopDomain);
    if (!domain) throw new Error("Bitte die Shopify-Shop-URL mit .myshopify.com eingeben");
    update.shop_domain = domain;
  }
  const secret = body.appSecret?.trim();
  if (secret) update.webhook_secret = secret;
  return update;
}