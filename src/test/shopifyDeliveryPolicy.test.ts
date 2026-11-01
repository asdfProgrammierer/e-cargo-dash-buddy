import { describe, expect, it, vi } from "vitest";
import { hasCronAuthorization, isEcargoDelivery } from "../../supabase/functions/shopify-push-fulfillments/policy";

const delivery = {
  is_pickup: false,
  dhl_tracking_number: null,
  dhl_label_url: null,
  route_stops: [{ routes: { status: "aktiv" } }],
};

describe("Shopify e-cargo delivery boundary", () => {
  it("allows genuine planned, active and completed delivery tours", () => {
    for (const status of ["geplant", "aktiv", "abgeschlossen"]) {
      expect(isEcargoDelivery({ ...delivery, route_stops: [{ routes: { status } }] })).toBe(true);
    }
  });
  it("excludes DHL tracking even on an e-cargo tour", () => {
    expect(isEcargoDelivery({ ...delivery, dhl_tracking_number: "DHL123" })).toBe(false);
  });
  it("excludes DHL label-only shipments", () => {
    expect(isEcargoDelivery({ ...delivery, dhl_label_url: "dhl/label.pdf" })).toBe(false);
  });
  it("does not send for shipments without a delivery tour", () => {
    expect(isEcargoDelivery({ ...delivery, route_stops: [] })).toBe(false);
    expect(isEcargoDelivery({ ...delivery, route_stops: [{ routes: null }] })).toBe(false);
  });
  it("excludes pickups even when they are on a mixed tour", () => {
    expect(isEcargoDelivery({ ...delivery, is_pickup: true })).toBe(false);
    expect(isEcargoDelivery({ ...delivery, is_pickup: null })).toBe(false);
  });
  it("accepts any qualifying delivery stop across repeat tours", () => {
    expect(isEcargoDelivery({ ...delivery, route_stops: [{ routes: null }, ...delivery.route_stops] })).toBe(true);
  });
});

describe("Shopify cron authentication", () => {
  it("accepts only a verified private cron key", async () => {
    expect(await hasCronAuthorization(new Headers({ "x-cron-key": "test-private-key" }), async (key) => key === "test-private-key")).toBe(true);
    expect(await hasCronAuthorization(new Headers({ "x-cron-key": "wrong" }), async () => false)).toBe(false);
  });
  it("never treats the public apikey or a cron body as authorization", async () => {
    const verify = vi.fn(async () => true);
    expect(await hasCronAuthorization(new Headers({ apikey: "public-anon-key" }), verify)).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
});