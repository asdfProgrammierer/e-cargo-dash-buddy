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

  it("charges the hourly price on exclusive tours", () => {
    const r = analyzeProfit(base({
      routes: [{ id: "r1", datum: "2026-10-01", driver_id: "d1", vehicle_id: null, exclusive_merchant_user_id: "a", hours: 3, km: 0 }],
      merchants: { a: m({ stundenpreis: 30 }), b: m({ stundenpreis: 99 }) },
    }));
    expect(r.revenue.hours).toBe(90);
  });

  it("bills the whole tour duration at the hourly price when a merchant's stop is on it", () => {
    const r = analyzeProfit(base({
      merchants: { a: m({ stundenpreis: 40 }), b: m({ stundenpreis: 99 }) },
      stops: [{ route_id: "r1", order_id: "o1", merchant_id: "a", pakete: 1, served: true, billPackages: true }],
    }));
    expect(r.revenue.hours).toBe(160);
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
      driverFilter: ["d2"],
    }));
    expect(r.revenue.total).toBe(3);
    expect(r.costs.wage).toBe(40);
  });

  it("filters by several selected drivers at once and excludes the rest", () => {
    const r = analyzeProfit(base({
      routes: [
        { id: "r1", datum: "2026-10-01", driver_id: "d1", vehicle_id: null, exclusive_merchant_user_id: null, hours: 2, km: 0 },
        { id: "r2", datum: "2026-10-01", driver_id: "d2", vehicle_id: null, exclusive_merchant_user_id: null, hours: 2, km: 0 },
        { id: "r3", datum: "2026-10-01", driver_id: "d3", vehicle_id: null, exclusive_merchant_user_id: null, hours: 2, km: 0 },
      ],
      wages: { d1: 10, d2: 20, d3: 30 },
      merchants: { a: m({ stopppreis: 1 }) },
      stops: ["r1", "r2", "r3"].map((rid, n) => ({ route_id: rid, order_id: `o${n}`, merchant_id: "a", pakete: 1, served: true, billPackages: true })),
      driverFilter: ["d1", "d3"],
    }));
    expect(r.revenue.total).toBe(2);
    expect(r.costs.wage).toBe(80);
  });

  it("sums several selected merchants and leaves out excluded ones", () => {
    const r = analyzeProfit(base({
      merchants: { a: m({ stopppreis: 1 }), b: m({ stopppreis: 2 }), c: m({ stopppreis: 4 }) },
      stops: ["a", "b", "c"].map((x, n) => ({ route_id: "r1", order_id: `o${n}`, merchant_id: x, pakete: 1, served: true, billPackages: true })),
      merchantFilter: ["a", "c"],
    }));
    expect(r.revenue.stops).toBe(5);
  });
});
