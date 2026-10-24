import { describe, it, expect } from "vitest";
import { routeRevenue } from "@/lib/routeRevenue";

const merchants = {
  a: { name: "A", paketpreis: 5, stopppreis: 1, stundenpreis: null, tagespauschale: 10, grundbeitrag_monat: null },
  p: { name: "Potpourri", paketpreis: null, stopppreis: null, stundenpreis: 40, tagespauschale: null, grundbeitrag_monat: null },
};
const stops = [
  { merchant_id: "a", pakete: 2, served: true, billPackages: true },
  { merchant_id: "a", pakete: 1, served: false, billPackages: true },
  { merchant_id: "p", pakete: 1, served: true, billPackages: true },
];

describe("routeRevenue", () => {
  it("planned counts every assigned stop and planned hours rounded up to 15 min", () => {
    const r = routeRevenue({ stops, hours: 3.7, merchants, mode: "planned" });
    expect(r.packages).toBe(15);
    expect(r.stops).toBe(2);
    expect(r.hours).toBe(150); // 3.75 h × 40
    expect(r.daily).toBe(10);
    expect(r.total).toBe(177);
  });
  it("actual counts only served stops", () => {
    const r = routeRevenue({ stops, hours: 4.1, merchants, mode: "actual" });
    expect(r.packages).toBe(10);
    expect(r.stops).toBe(1);
    expect(r.hours).toBe(170); // 4.25 h × 40
  });
  it("packages are billed only once per order", () => {
    const r = routeRevenue({ stops: [{ merchant_id: "a", pakete: 3, served: true, billPackages: false }], hours: 0, merchants, mode: "actual" });
    expect(r.packages).toBe(0);
    expect(r.stops).toBe(1);
  });
});
