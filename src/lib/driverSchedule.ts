export type ScheduleStatus = "dienst" | "frei" | "urlaub" | "krank" | "nicht_verfuegbar";

export const SCHEDULE_STATUSES: { key: ScheduleStatus; label: string; short: string; cls: string }[] = [
  { key: "dienst", label: "Dienst", short: "D", cls: "bg-primary text-primary-foreground" },
  { key: "frei", label: "Frei", short: "F", cls: "bg-secondary text-secondary-foreground" },
  { key: "urlaub", label: "Urlaub", short: "U", cls: "bg-accent text-accent-foreground ring-1 ring-inset ring-border" },
  { key: "krank", label: "Krank", short: "K", cls: "bg-destructive text-destructive-foreground" },
  { key: "nicht_verfuegbar", label: "Nicht verfügbar", short: "N", cls: "bg-muted text-muted-foreground ring-1 ring-inset ring-border" },
];

export const scheduleLabel = (s?: string | null) => SCHEDULE_STATUSES.find((x) => x.key === s)?.label ?? null;
