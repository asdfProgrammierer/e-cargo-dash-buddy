import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { vacationSummary, type VacationSummary } from "@/lib/driverVacation";

export interface VacationDriver { id: string; name: string; vacation_days_per_year?: number | null; work_days_per_week?: number | null }

const todayYmd = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Lädt Urlaubsstand eines Jahres für mehrere Fahrer (Status-Key "urlaub"). */
export function useVacationSummaries(drivers: VacationDriver[], year = new Date().getFullYear(), reloadKey = 0) {
  const [map, setMap] = useState<Record<string, VacationSummary>>({});
  const ids = drivers.map((d) => d.id).join(",");
  useEffect(() => {
    if (!drivers.length) return;
    supabase.from("driver_schedules").select("driver_id, datum").eq("status", "urlaub")
      .gte("datum", `${year}-01-01`).lte("datum", `${year}-12-31`).in("driver_id", drivers.map((d) => d.id))
      .then(({ data }) => {
        const byDriver: Record<string, string[]> = {};
        (data ?? []).forEach((r) => (byDriver[r.driver_id] ??= []).push(r.datum));
        const t = todayYmd(), out: Record<string, VacationSummary> = {};
        for (const d of drivers) out[d.id] = vacationSummary(byDriver[d.id] ?? [], d.vacation_days_per_year ?? 28, d.work_days_per_week ?? 5, t);
        setMap(out);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, year, reloadKey]);
  return map;
}

export function VacationStats({ s, year, workDays }: { s?: VacationSummary; year: number; workDays: number }) {
  if (!s) return <p className="text-sm text-muted-foreground">Lade…</p>;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold">Urlaub {year} · {workDays}-Tage-Woche</p>
      <div className="flex justify-between"><span>Jahresanspruch</span><span>{s.entitlement} Tage</span></div>
      <div className="flex justify-between"><span>Genommen</span><span>{s.taken} Tage</span></div>
      <div className="flex justify-between"><span>Geplant</span><span>{s.planned} Tage</span></div>
      <div className="flex justify-between border-t pt-1 font-semibold"><span>Verbleibend</span><span className={s.remaining < 0 ? "text-destructive" : ""}>{s.remaining} Tage</span></div>
      <p className="text-xs text-muted-foreground pt-1">Sonntage & NRW-Feiertage werden nicht gezählt.</p>
    </div>
  );
}

export function DriverVacationPopover({ driver, summary, year, children }: { driver: VacationDriver; summary?: VacationSummary; year: number; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64"><p className="font-medium mb-2">{driver.name}</p><VacationStats s={summary} year={year} workDays={driver.work_days_per_week ?? 5} /></PopoverContent>
    </Popover>
  );
}
