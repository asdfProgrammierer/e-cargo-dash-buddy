import { describe, it, expect } from "vitest";
import { routeProfit, type RouteProfitStop } from "@/lib/routeProfit";

const m = (o: Partial<{ paketpreis: number; stopppreis: number; stundenpreis: number; tagespauschale: number }>) =>
  ({ name: "", paketpreis: null, stopppreis: null, stundenpreis: null, tagespauschale: null, grundbeitrag_monat: null, ...o });
const stop = (id: string, merchant_id: string, detourSec: number | null, o: Partial<RouteProfitStop> = {}): RouteProfitStop =>
  ({ id, merchant_id, pakete: 1, served: true, billPackages: true, detourSec, stopSec: 0, ...o });

describe("routeProfit", () => {
  it("adds 30 % employer surcharge to the wage and computes margin", () => {
    const r = routeProfit({ stops: [stop("a", "A", null)], hours: 2, km: 0, wage: 15, vehicle: null, merchants: { A: m({ paketpreis: 100 }) }, mode: "planned" });
    expect(r.costs.wage).toBe(30);
    expect(r.costs.surcharge).toBe(9);
    expect(r.margin).toBe(61);
  });

  it("marks a remote stop as loss when its detour carries most of the tour cost", () => {
    const r = routeProfit({
      stops: [stop("near", "A", 100), stop("far", "B", 900)],
      hours: 1, km: 0, wage: 50 / 1.3, vehicle: null,
      merchants: { A: m({ paketpreis: 10 }), B: m({ paketpreis: 10 }) }, mode: "planned",
    });
    expect(r.byStop.far.cost).toBe(45);
    expect(r.byStop.far.margin).toBe(-35);
    expect(r.byStop.near.margin).toBe(5);
  });

  it("counts only served stops in actual mode", () => {
    const r = routeProfit({
      stops: [stop("a", "A", null), stop("b", "A", null, { served: false })],
      hours: 1, km: 0, wage: 0, vehicle: null, merchants: { A: m({ stopppreis: 3 }) }, mode: "actual",
    });
    expect(r.revenue.total).toBe(3);
  });
});
