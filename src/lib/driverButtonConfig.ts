/**
 * Zentrale Button-Style-Config für die Fahrer-App.
 * Sorgt für einheitliche Text-Skalierung und verhindert Umbrüche.
 */
export const driverBtnBase =
  "overflow-hidden text-ellipsis active:scale-[0.98] transition-transform";

export const driverBtn = {
  /** Große CTA über volle Breite (Zugestellt, Zustellung bestätigen, Bestätigen) */
  ctaFull: `${driverBtnBase} w-full h-14 text-sm font-semibold`,
  /** Große CTA für 2-Spalten-Grid (Abbrechen / Übernehmen in Sheets) */
  ctaHalf: `${driverBtnBase} h-14 text-sm font-semibold`,
  /** Kleine Grid-Buttons (Navi, Anrufen, Unterschrift, Foto) */
  grid: `${driverBtnBase} h-12 text-xs px-2`,
  /** Destructive / Nicht zugestellt – volle Breite */
  dangerFull: `${driverBtnBase} w-full h-12 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive px-2`,
  /** Outline in Sheets (Löschen) */
  outlineSm: `${driverBtnBase} h-11 px-4 text-sm`,
  /** Ghost-Utility (Foto entfernen) */
  ghost: `${driverBtnBase} text-xs`,
  /** Standard-Form-Buttons (Einloggen, Abmelden, Navigation zum Depot) */
  form: `${driverBtnBase} w-full h-12 text-sm`,
  /** Kleiner Utility-Button (Live-Standort aktivieren) */
  sm: `${driverBtnBase} h-9 px-3 text-xs`,
} as const;
