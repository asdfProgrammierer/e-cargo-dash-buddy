import { describe, it, expect } from "vitest";
import { vehicleCosts } from "@/lib/vehicleCosts";

describe("vehicleCosts", () => {
  it("full year: 250 €/Monat fix + 50 € Wartung über 60 h", () => {
    const r = vehicleCosts({ fixPerMonth: 250, costPerKm: 0, days: 365, hours: 600, km: 0, maintenance: 0 });
    expect(r.fixed).toBe(3000);
    expect(r.perHour).toBe(5);
  });
  it("adds km costs and maintenance", () => {
    const r = vehicleCosts({ fixPerMonth: 0, costPerKm: 0.1, days: 30, hours: 10, km: 500, maintenance: 50 });
    expect(r.total).toBe(100);
    expect(r.perHour).toBe(10);
    expect(r.perKm).toBe(0.2);
  });
  it("no hours → no hourly rate", () => {
    expect(vehicleCosts({ fixPerMonth: 100, costPerKm: 0, days: 30, hours: 0, km: 0, maintenance: 0 }).perHour).toBeNull();
  });
});

import { sumCostItems } from "@/lib/vehicleCosts";
describe("sumCostItems", () => {
  it("yearly costs count as 1/12 per month, km separate", () => {
    expect(sumCostItems([
      { intervall: "monat", betrag: 180 },
      { intervall: "jahr", betrag: 420 },
      { intervall: "km", betrag: 0.05 },
      { intervall: "km", betrag: 0.03 },
    ])).toEqual({ fixPerMonth: 215, costPerKm: 0.08 });
  });
});

import { energyCostPerKm } from "@/lib/vehicleCosts";
describe("energyCostPerKm", () => {
  it("0,35 €/kWh bei 20 kWh/100 km = 0,07 €/km", () => {
    expect(energyCostPerKm(0.35, 20)).toBe(0.07);
  });
});
