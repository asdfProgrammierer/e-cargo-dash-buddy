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

export function scheduleStartTime(value: string): string | null {
  if (!value) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Bitte eine gültige Startzeit angeben.");
  return value;
}