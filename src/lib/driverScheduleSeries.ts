export interface ScheduleSeriesEntry {
  id: string;
  driver_id: string;
  datum: string;
  series_id: string | null;
}

/** Only one original save belongs to a series, never every entry with the same status. */
export function scheduleDeletionEntries<T extends ScheduleSeriesEntry>(entries: T[], anchor: ScheduleSeriesEntry, scope: "day" | "series"): T[] {
  return entries.filter((entry) => entry.driver_id === anchor.driver_id &&
    (scope === "series" && anchor.series_id ? entry.series_id === anchor.series_id : entry.id === anchor.id))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}