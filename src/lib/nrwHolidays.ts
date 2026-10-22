const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

/** Gesetzliche Feiertage in NRW: Map YYYY-MM-DD → Name. */
export function nrwHolidays(year: number): Record<string, string> {
  const e = easter(year);
  const off = (n: number) => ymd(new Date(e.getFullYear(), e.getMonth(), e.getDate() + n));
  return {
    [`${year}-01-01`]: "Neujahr",
    [off(-2)]: "Karfreitag",
    [off(1)]: "Ostermontag",
    [`${year}-05-01`]: "Tag der Arbeit",
    [off(39)]: "Christi Himmelfahrt",
    [off(50)]: "Pfingstmontag",
    [off(60)]: "Fronleichnam",
    [`${year}-10-03`]: "Tag der Deutschen Einheit",
    [`${year}-11-01`]: "Allerheiligen",
    [`${year}-12-25`]: "1. Weihnachtstag",
    [`${year}-12-26`]: "2. Weihnachtstag",
  };
}

/** Name des Ruhetags (Feiertag oder Sonntag) oder null. */
export function closedDayLabel(d: Date): string | null {
  return nrwHolidays(d.getFullYear())[ymd(d)] ?? (d.getDay() === 0 ? "Sonntag" : null);
}
