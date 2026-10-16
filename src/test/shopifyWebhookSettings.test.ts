import { describe, expect, it } from "vitest";
import { normalizeShopDomain, settingsUpdate } from "../../supabase/functions/shopify-webhook-setup/settings";

describe("Shopify webhook settings", () => {
  it("normalizes the entered Shopify URL", () => {
    expect(settingsUpdate({ shopDomain: "https://Fiege.myshopify.com/admin" })).toEqual({ shop_domain: "fiege.myshopify.com" });
  });
  it("preserves the saved secret when the replacement is empty", () => {
    expect(settingsUpdate({ shopDomain: "fiege", appSecret: "  " })).toEqual({ shop_domain: "fiege.myshopify.com" });
  });
  it("rejects non-Shopify hosts", () => {
    expect(normalizeShopDomain("https://example.com")).toBeNull();
    expect(() => settingsUpdate({ shopDomain: "https://example.com" })).toThrow();
  });
});