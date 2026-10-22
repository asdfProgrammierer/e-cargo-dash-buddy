import { describe, expect, it } from "vitest";
import { scheduleDates, scheduleStartTime, scheduleTimeValue } from "@/lib/driverScheduleDates";

describe("Einsatzplan Zeitraum", () => {
  it("includes both endpoints across months", () => {
    expect(scheduleDates("2026-10-31", "2026-11-02")).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("rejects missing dates instead of silently saving nothing", () => {
    expect(() => scheduleDates("", "2026-11-02")).toThrow();
    expect(() => scheduleDates("2026-11-02", "")).toThrow();
  });
  it("rejects an inverted range and invalid dates", () => {
    expect(() => scheduleDates("2026-11-03", "2026-11-02")).toThrow();
    expect(() => scheduleDates("2026-02-30", "2026-03-02")).toThrow();
  });
  it("limits recurring entries to selected weekdays", () => {
    expect(scheduleDates("2026-10-26", "2026-11-01", [1, 4])).toEqual(["2026-10-26", "2026-10-29"]);
  });
});
describe("Geplante Startzeit", () => {
  it("preserves quarter-hour times and allows no start time", () => {
    expect(scheduleStartTime("13:45")).toBe("13:45");
    expect(scheduleStartTime("")).toBeNull();
    expect(() => scheduleStartTime("25:10")).toThrow();
  });
  it("rejects times outside the 15-minute rhythm", () => {
    expect(() => scheduleStartTime("07:10")).toThrow("15-Minuten-Rhythmus");
    expect(() => scheduleStartTime("07:59")).toThrow("15-Minuten-Rhythmus");
  });
  it("snaps stored times up to the next quarter hour", () => {
    expect(scheduleTimeValue("07:10")).toBe("07:15");
    expect(scheduleTimeValue("07:50:00")).toBe("08:00");
    expect(scheduleTimeValue("23:50")).toBe("23:45");
    expect(scheduleTimeValue("13:45")).toBe("13:45");
    expect(scheduleTimeValue(null)).toBe("");
  });
});