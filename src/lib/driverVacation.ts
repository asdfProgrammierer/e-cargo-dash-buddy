import { closedDayLabel } from "@/lib/nrwHolidays";

/** Zählt ein Datum (YYYY-MM-DD) als Urlaubstag? Sonntage/NRW-Feiertage nie, Samstage nur bei 6-Tage-Woche. */
export function isVacationWorkday(datum: string, workDaysPerWeek: number): boolean {
  const [y, m, d] = datum.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (closedDayLabel(date)) return false;
  if (date.getDay() === 6 && workDaysPerWeek < 6) return false;
  return true;
}

export interface VacationSummary { entitlement: number; taken: number; planned: number; remaining: number }

/** taken = bis einschließlich heute, planned = ab morgen. */
export function vacationSummary(dates: string[], entitlement: number, workDaysPerWeek: number, today: string): VacationSummary {
  let taken = 0, planned = 0;
  for (const d of new Set(dates)) {
    if (!isVacationWorkday(d, workDaysPerWeek)) continue;
    if (d <= today) taken++; else planned++;
  }
  return { entitlement, taken, planned, remaining: entitlement - taken - planned };
}
