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