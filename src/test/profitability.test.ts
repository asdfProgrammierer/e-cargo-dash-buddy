import { describe, it, expect } from "vitest";
import { analyzeProfit, type ProfitInput, type MerchantPrices } from "@/lib/profitability";

const m = (p: Partial<MerchantPrices>): MerchantPrices => ({ name: "M", paketpreis: null, stopppreis: null, stundenpreis: null, tagespauschale: null, grundbeitrag_monat: null, ...p });
const base = (over: Partial<ProfitInput> = {}): ProfitInput => ({
  days: 30,
  routes: [{ id: "r1", datum: "2026-10-01", driver_id: "d1", vehicle_id: null, exclusive_merchant_user_id: null, hours: 4, km: 50 }],
  stops: [],
  merchants: {},
  wages: { d1: 15 },
  vehicles: {},
  ...over,
});

describe("analyzeProfit", () => {
  it("bills every served stop, even if not delivered", () => {
    const r = analyzeProfit(base({
      merchants: { a: m({ stopppreis: 2 }) },
      stops: [
        { route_id: "r1", order_id: "o1", merchant_id: "a", pakete: 1, served: true, billPackages: true },
        { route_id: "r1", order_id: "o2", merchant_id: "a", pakete: 1, served: true, billPackages: true },
      ],
    }));
    expect(r.revenue.stops).toBe(4);
  });

  it("bills packages only once per order across repeated attempts", () => {
    const r = analyzeProfit(base({
      merchants: { a: m({ paketpreis: 5 }) },
      stops: [
        { route_id: "r1", order_id: "o1", merchant_id: "a", pakete: 2, served: true, billPackages: true },
        { route_id: "r1", order_id: "o1", merchant_id: "a", pakete: 2, served: true, billPackages: false },
      ],
    }));
    expect(r.revenue.packages).toBe(10);
  });

  it("charges the daily fee once per merchant and day", () => {
    const r = analyzeProfit(base({
      routes: [
        { id: "r1", datum: "2026-10-01", driver_id: "d1", vehicle_id: null, exclusive_merchant_user_id: null, hours: 1, km: 0 },
        { id: "r2", datum: "2026-10-01", driver_id: "d1", vehicle_id: null, exclusive_merchant_user_id: null, hours: 1, km: 0 },
      ],
      merchants: { a: m({ tagespauschale: 40 }) },
      stops: [
        { route_id: "r1", order_id: "o1", merchant_id: "a", pakete: 1, served: true, billPackages: true },
        { route_id: "r2", order_id: "o2", merchant_id: "a", pakete: 1, served: true, billPackages: true },
      ],
    }));
    expect(r.revenue.daily).toBe(40);
  });

  it("charges the hourly price only on exclusive tours", () => {
    const r = analyzeProfit(base({
      routes: [{ id: "r1", datum: "2026-10-01", driver_id: "d1", vehicle_id: null, exclusive_merchant_user_id: "a", hours: 3, km: 0 }],
      merchants: { a: m({ stundenpreis: 30 }), b: m({ stundenpreis: 99 }) },
    }));
    expect(r.revenue.hours).toBe(90);
  });

  it("adds a 30 % employer surcharge shown separately from gross wage", () => {
    const r = analyzeProfit(base());
    expect(r.costs.wage).toBe(60);
    expect(r.costs.surcharge).toBe(18);
  });

  it("filters revenue and costs by driver", () => {
    const r = analyzeProfit(base({
      routes: [
        { id: "r1", datum: "2026-10-01", driver_id: "d1", vehicle_id: null, exclusive_merchant_user_id: null, hours: 2, km: 0 },
        { id: "r2", datum: "2026-10-01", driver_id: "d2", vehicle_id: null, exclusive_merchant_user_id: null, hours: 2, km: 0 },
      ],
      wages: { d1: 10, d2: 20 },
      merchants: { a: m({ stopppreis: 3, grundbeitrag_monat: 100 }) },
      stops: [
        { route_id: "r1", order_id: "o1", merchant_id: "a", pakete: 1, served: true, billPackages: true },
        { route_id: "r2", order_id: "o2", merchant_id: "a", pakete: 1, served: true, billPackages: true },
      ],
      driverFilter: "d2",
    }));
    expect(r.revenue.total).toBe(3);
    expect(r.costs.wage).toBe(40);
  });
});
