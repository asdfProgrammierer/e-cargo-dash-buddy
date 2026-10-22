import { describe, it, expect } from "vitest";
import { nrwHolidays, closedDayLabel } from "@/lib/nrwHolidays";

describe("NRW Feiertage", () => {
  it("2026 enthält bewegliche Feiertage korrekt", () => {
    const h = nrwHolidays(2026);
    expect(h["2026-04-03"]).toBe("Karfreitag");
    expect(h["2026-04-06"]).toBe("Ostermontag");
    expect(h["2026-05-14"]).toBe("Christi Himmelfahrt");
    expect(h["2026-05-25"]).toBe("Pfingstmontag");
    expect(h["2026-06-04"]).toBe("Fronleichnam");
    expect(Object.keys(h)).toHaveLength(11);
  });
  it("Sonntage sind Ruhetage, Samstage nicht", () => {
    expect(closedDayLabel(new Date(2026, 9, 25))).toBe("Sonntag");
    expect(closedDayLabel(new Date(2026, 9, 24))).toBeNull();
    expect(closedDayLabel(new Date(2026, 10, 1))).toBe("Allerheiligen");
  });
});
