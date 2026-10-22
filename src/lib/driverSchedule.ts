import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ScheduleStatus = string;

export interface ScheduleStatusDef {
  key: string;
  label: string;
  short: string;
  color: string;
  is_duty: boolean;
  active: boolean;
  sort_order: number;
}

/** Farbvorlagen: Klasse für die App, Hex-Werte für die Druckansicht. */
export const SCHEDULE_COLORS: Record<string, { label: string; cls: string; bg: string; fg: string }> = {
  gruen: { label: "Grün", cls: "bg-primary text-primary-foreground", bg: "#2f8f5b", fg: "#fff" },
  gruen_dunkel: { label: "Dunkelgrün", cls: "bg-primary/80 text-primary-foreground ring-1 ring-inset ring-foreground/30", bg: "#1f6b42", fg: "#fff" },
  gruen_hell: { label: "Hellgrün", cls: "bg-primary/30 text-foreground", bg: "#cdebd6", fg: "#123" },
  blau: { label: "Kräftigblau", cls: "bg-schedule-blue text-schedule-blue-foreground", bg: "#2385e7", fg: "#fff" },
  gelb: { label: "Orange", cls: "bg-warning text-warning-foreground", bg: "#f8a30d", fg: "#fff" },
  braun: { label: "Braun", cls: "bg-schedule-brown text-schedule-brown-foreground", bg: "#784631", fg: "#fff" },
  grau: { label: "Grau", cls: "bg-muted-foreground/40 text-foreground", bg: "#c4c4c4", fg: "#222" },
  rot_mittel: { label: "Mittelrot", cls: "bg-destructive/70 text-destructive-foreground", bg: "#e57070", fg: "#fff" },
  rot: { label: "Rot", cls: "bg-destructive text-destructive-foreground", bg: "#d92f2f", fg: "#fff" },
  rot_hell: { label: "Hellrot", cls: "bg-destructive/20 text-destructive ring-1 ring-inset ring-destructive/40", bg: "#f7d2d2", fg: "#8a1c1c" },
};

export const colorOf = (c?: string) => SCHEDULE_COLORS[c ?? ""] ?? SCHEDULE_COLORS.grau;

/** Macht aus einem Namen einen stabilen Schlüssel (z. B. „Bochum bringt´s" → bochum_bringt_s). */
export function statusKeyFromLabel(label: string): string {
  const k = label.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return k || `status_${Date.now()}`;
}

export function useScheduleStatuses() {
  const [statuses, setStatuses] = useState<ScheduleStatusDef[]>([]);
  const reload = useCallback(async () => {
    const { data } = await supabase.from("driver_schedule_statuses").select("key,label,short,color,is_duty,active,sort_order").order("sort_order");
    setStatuses((data as ScheduleStatusDef[]) ?? []);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { statuses, reload };
}
