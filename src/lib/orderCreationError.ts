/** Translate only the known configuration failure; do not expose arbitrary database errors. */
export function orderCreationError(error: { message?: string }, fallback: string): string {
  return error.message?.includes("Für diesen Händler ist kein Händlercode hinterlegt")
    ? "Für diesen Händler fehlt der Händlercode. Bitte die e-cargo-Verwaltung kontaktieren, damit der Code hinterlegt wird."
    : fallback;
}