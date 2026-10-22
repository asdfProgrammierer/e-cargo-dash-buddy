import { describe, expect, it } from "vitest";
import { scheduleDates, scheduleStartTime } from "@/lib/driverScheduleDates";

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
  it("preserves entered time and allows no start time", () => {
    expect(scheduleStartTime("13:50")).toBe("13:50");
    expect(scheduleStartTime("")).toBeNull();
    expect(() => scheduleStartTime("25:10")).toThrow();
  });
});