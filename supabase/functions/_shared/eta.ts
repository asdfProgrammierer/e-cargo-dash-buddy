// Shared ETA formatting helpers used by edge functions.
// Returns a ±30 minute window string in Europe/Berlin time, or null if the
// input is missing/unparseable. Always paired with a graceful fallback in
// the consumer (e.g. "Wird Ihnen kurz vor Zustellung mitgeteilt").

const fmtBerlin = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(d);

const fmtBerlinDate = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(d);

// Short date like "Sa., 07.11." for display next to a time window.
export const fmtBerlinShortDate = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(d);

// Formats a YYYY-MM-DD route date as "Samstag, 28.11.2026" in Europe/Berlin.
export function formatBerlinDateString(isoDate: string | null | undefined): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return fmtBerlinDate(d);
}

export const ETA_FALLBACK_TEXT = "Wird Ihnen kurz vor der Zustellung mitgeteilt";

export interface EtaWindow {
  window: string;
  center: string;
  date: string;
  fromIso: string;
  toIso: string;
  centerIso: string;
}

export function buildEtaWindow(input: string | Date | null | undefined, plusMinusMinutes = 30): EtaWindow | null {
  if (!input) return null;
  const eta = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(eta.getTime())) return null;
  const delta = plusMinusMinutes * 60 * 1000;
  const from = new Date(eta.getTime() - delta);
  const to = new Date(eta.getTime() + delta);
  return {
    window: `${fmtBerlin(from)} – ${fmtBerlin(to)} Uhr`,
    center: fmtBerlin(eta),
    date: fmtBerlinDate(eta),
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    centerIso: eta.toISOString(),
  };
}