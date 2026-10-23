import { describe, it, expect } from "vitest";
import { isVacationWorkday, vacationSummary } from "@/lib/driverVacation";

describe("driverVacation", () => {
  it("never counts Sundays or NRW holidays", () => {
    expect(isVacationWorkday("2026-10-25", 6)).toBe(false); // Sonntag
    expect(isVacationWorkday("2026-12-25", 6)).toBe(false); // 1. Weihnachtstag
  });
  it("counts Saturdays only for 6-day week", () => {
    expect(isVacationWorkday("2026-10-24", 5)).toBe(false);
    expect(isVacationWorkday("2026-10-24", 6)).toBe(true);
  });
  it("splits taken/planned and computes remaining", () => {
    // Mo 19.10. – So 25.10.2026, 5-Tage-Woche => 5 Tage; heute 21.10.
    const dates = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
    expect(vacationSummary(dates, 28, 5, "2026-10-21")).toEqual({ entitlement: 28, taken: 3, planned: 2, remaining: 23 });
  });
});
