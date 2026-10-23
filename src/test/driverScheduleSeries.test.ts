import { describe, expect, it } from "vitest";
import { scheduleDeletionEntries } from "@/lib/driverScheduleSeries";

const entry = (id: string, datum: string, series_id: string | null, driver_id = "driver-a") => ({ id, datum, series_id, driver_id });

describe("Einsatzplan löschen", () => {
  it("deletes every Monday of the selected recurring series across months only", () => {
    const monday = entry("1", "2026-10-26", "mondays");
    expect(scheduleDeletionEntries([monday, entry("2", "2026-11-02", "mondays"), entry("3", "2026-11-09", "other"), entry("4", "2026-11-02", "mondays", "driver-b")], monday, "series").map(e => e.id)).toEqual(["1", "2"]);
  });
  it("deletes the whole chosen vacation without deleting another vacation", () => {
    const start = entry("1", "2026-11-16", "vacation-a");
    expect(scheduleDeletionEntries([start, entry("2", "2026-11-17", "vacation-a"), entry("3", "2026-12-21", "vacation-b")], start, "series").map(e => e.id)).toEqual(["1", "2"]);
  });
  it("deletes only the selected day when single-day scope is chosen", () => {
    const start = entry("1", "2026-11-16", "vacation-a");
    expect(scheduleDeletionEntries([start, entry("2", "2026-11-17", "vacation-a")], start, "day").map(e => e.id)).toEqual(["1"]);
  });
  it("never groups entries with missing series identifiers", () => {
    const start = entry("1", "2026-11-16", null);
    expect(scheduleDeletionEntries([start, entry("2", "2026-11-17", null)], start, "series").map(e => e.id)).toEqual(["1"]);
  });
});