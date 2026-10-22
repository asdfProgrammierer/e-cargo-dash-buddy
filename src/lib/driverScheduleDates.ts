const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function scheduleDates(from: string, to: string, weekdays: number[] = []): string[] {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Bitte Von und Bis vollständig angeben.");
    const date = new Date(`${value}T12:00:00`);
    if (!Number.isFinite(date.getTime()) || formatDate(date) !== value) throw new Error("Bitte ein gültiges Datum angeben.");
    return date;
  };
  const start = parse(from), end = parse(to);
  if (end < start) throw new Error("Enddatum liegt vor Startdatum.");
  const dates: string[] = [];
  let span = 0;
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    if (++span > 366) throw new Error("Maximal ein Jahr auf einmal.");
    if (!weekdays.length || weekdays.includes(day.getDay())) dates.push(formatDate(day));
  }
  if (!dates.length) throw new Error("Im Zeitraum liegt keiner der gewählten Wochentage.");
  return dates;
}

export const QUARTER_MINUTES = ["00", "15", "30", "45"];

const HOUR = /^([01]\d|2[0-3])$/;
const LAST_QUARTER = 23 * 60 + 45;

function snapQuarter(hour: number, minute: number): string {
  const total = Math.min(Math.ceil((hour * 60 + minute) / 15) * 15, LAST_QUARTER);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Stored "HH:MM:SS" or "HH:MM" as a selectable "HH:MM" on the 15-minute rhythm; "" when nothing is set. */
export function scheduleTimeValue(value: string | null | undefined): string {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
  if (!match || !HOUR.test(match[1])) return "";
  return snapQuarter(Number(match[1]), Number(match[2]));
}

/** Hour and minute parts for the start-time dropdowns; falls back to 09:00 when nothing is set. */
export function scheduleTimeParts(value: string | null | undefined): { hour: string; minute: string } {
  const time = scheduleTimeValue(value);
  return time ? { hour: time.slice(0, 2), minute: time.slice(3, 5) } : { hour: "09", minute: "00" };
}

export function scheduleStartTime(value: string): string | null {
  if (!value) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Bitte eine gültige Startzeit angeben.");
  if (Number(value.slice(3, 5)) % 15 !== 0) throw new Error("Bitte eine Startzeit im 15-Minuten-Rhythmus wählen: 00, 15, 30 oder 45.");
  return value;
}
