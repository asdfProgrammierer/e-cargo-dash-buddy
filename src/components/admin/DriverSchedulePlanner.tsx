import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CalendarRange, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { SCHEDULE_STATUSES, type ScheduleStatus } from "@/lib/driverSchedule";
import { scheduleDates, scheduleStartTime } from "@/lib/driverScheduleDates";

interface Driver { id: string; name: string }
interface Entry { driver_id: string; datum: string; status: ScheduleStatus; notiz: string | null; start_time: string | null }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
interface DayStat { routes: number; stops: number; done: number; km: number; sec: number }
/** Rundet auf die nächste Viertelstunde auf und gibt Dezimalstunden aus (z. B. 3,75). */
export const roundUpQuarterHours = (sec: number) => (sec <= 0 ? 0 : Math.ceil(sec / 900) / 4);
const hm = (sec: number) => roundUpQuarterHours(sec).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DriverSchedulePlanner({ drivers }: { drivers: Driver[] }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [edit, setEdit] = useState<{ driverId: string; from: string; to: string; status: ScheduleStatus | "leer"; notiz: string; startTime: string; weekdays?: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Record<string, DayStat>>({});
  const [monthSec, setMonthSec] = useState<Record<string, number>>({});
  const [defaultStart, setDefaultStart] = useState("");
  const [enabled, setEnabled] = useState<string[]>(SCHEDULE_STATUSES.map((s) => s.key));
  useEffect(() => {
    supabase.from("driver_schedule_settings").select("default_start_time, enabled_statuses").eq("id", 1).maybeSingle().then(({ data }) => {
      if (!data) return;
      setDefaultStart(data.default_start_time?.slice(0, 5) ?? "");
      setEnabled(data.enabled_statuses ?? []);
    });
  }, []);

  const days = useMemo(() => {
    const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));
  }, [month]);

  const load = async () => {
    const { data, error } = await supabase.from("driver_schedules")
      .select("driver_id, datum, status, notiz, start_time")
      .gte("datum", ymd(days[0])).lte("datum", ymd(days[days.length - 1]));
    if (error) { toast.error("Plan konnte nicht geladen werden"); return; }
    const map: Record<string, Entry> = {};
    (data as Entry[]).forEach((e) => { map[`${e.driver_id}_${e.datum}`] = e; });
    setEntries(map);
    loadStats();
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const loadStats = async () => {
    const from = ymd(days[0]), to = ymd(days[days.length - 1]);
    const start = new Date(days[0]); start.setDate(start.getDate() - 1);
    const end = new Date(days[days.length - 1]); end.setDate(end.getDate() + 2);
    const [{ data: routes }, { data: sessions }] = await Promise.all([
      supabase.from("routes").select("id, driver_id, datum, total_distance_m, route_stops(status)")
        .gte("datum", from).lte("datum", to).not("driver_id", "is", null),
      supabase.from("driver_work_sessions").select("driver_id, route_id, started_at, ended_at, end_reason")
        .gte("started_at", start.toISOString()).lt("started_at", end.toISOString()),
    ]);
    const map: Record<string, DayStat> = {};
    const get = (k: string) => (map[k] ??= { routes: 0, stops: 0, done: 0, km: 0, sec: 0 });
    for (const r of (routes ?? []) as any[]) {
      const s = get(`${r.driver_id}_${r.datum}`);
      s.routes++; s.km += (r.total_distance_m ?? 0) / 1000;
      const st = (r.route_stops ?? []) as { status: string }[];
      s.stops += st.length; s.done += st.filter((x) => x.status === "erledigt").length;
    }
    const monthly: Record<string, number> = {};
    // Pro Route & Tag: erster Start bis letztes Ende (Lücken durch App-Neustarts werden überbrückt).
    // Rein alte Depot-Sessions (ohne neue Session derselben Route) werden ignoriert.
    const spans: Record<string, { driver: string; day: string; start: number; end: number; legacyOnly: boolean }> = {};
    for (const w of (sessions ?? []) as any[]) {
      const st = new Date(w.started_at);
      const day = st.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
      if (day < from || day > to) continue;
      const k = `${w.driver_id}_${day}_${w.route_id ?? w.started_at}`;
      const s = st.getTime(), e = w.ended_at ? new Date(w.ended_at).getTime() : Date.now();
      const legacy = w.end_reason === "auto_depot";
      const cur = spans[k];
      if (!cur) spans[k] = { driver: w.driver_id, day, start: s, end: e, legacyOnly: legacy };
      else { cur.start = Math.min(cur.start, s); cur.end = Math.max(cur.end, e); cur.legacyOnly &&= legacy; }
    }
    for (const sp of Object.values(spans)) {
      if (sp.legacyOnly) continue;
      get(`${sp.driver}_${sp.day}`).sec += Math.max(0, (sp.end - sp.start) / 1000);
    }
    // Monatssumme = Summe der pro Tag aufgerundeten Zeiten
    for (const [k, v] of Object.entries(map)) {
      if (v.sec <= 0) continue;
      const id = k.slice(0, k.lastIndexOf("_"));
      monthly[id] = (monthly[id] ?? 0) + Math.ceil(v.sec / 900) * 900;
    }
    setStats(map); setMonthSec(monthly);
  };

  const open = (driverId: string, datum: string) => {
    const e = entries[`${driverId}_${datum}`];
    setEdit({ driverId, from: datum, to: datum, status: e?.status ?? "dienst", notiz: e?.notiz ?? "", startTime: e ? (e.start_time?.slice(0, 5) ?? "") : defaultStart });
  };

  const save = async () => {
    if (!edit || busy) return;
    let dates: string[];
    let startTime: string | null;
    try {
      dates = scheduleDates(edit.from, edit.to, edit.weekdays);
      startTime = edit.status === "leer" ? null : scheduleStartTime(edit.startTime);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bitte Eingaben prüfen.");
      return;
    }
    setBusy(true);
    try {
    const { error } = edit.status === "leer"
      ? await supabase.from("driver_schedules").delete().eq("driver_id", edit.driverId).in("datum", dates)
      : await supabase.from("driver_schedules").upsert(
          dates.map((datum) => ({ driver_id: edit.driverId, datum, status: edit.status, notiz: edit.notiz.trim() || null, start_time: startTime })),
          { onConflict: "driver_id,datum" });
    if (error) throw error;
    toast.success("Plan gespeichert");
    setEdit(null);
    const savedMonth = new Date(`${dates[0]}T12:00:00`);
    if (savedMonth.getMonth() !== month.getMonth() || savedMonth.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(savedMonth.getFullYear(), savedMonth.getMonth(), 1));
    } else {
      await load();
    }
    } catch (error) {
      toast.error("Speichern fehlgeschlagen: " + (error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Unbekannter Fehler"));
    } finally {
      setBusy(false);
    }
  };

  const today = ymd(new Date());
  const monthLabel = month.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const printPlan = () => {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Pop-up wurde blockiert"); return; }
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
    const head = drivers.map((d) => `<th>${esc(d.name)}</th>`).join("");
    const rows = days.map((d) => {
      const we = d.getDay() === 0 || d.getDay() === 6;
      const cells = drivers.map((dr) => {
        const e = entries[`${dr.id}_${ymd(d)}`];
        const meta = e && SCHEDULE_STATUSES.find((s) => s.key === e.status);
        return `<td class="${e?.status ?? ""}">${meta ? esc(meta.label) : ""}${e?.notiz ? `<div class="n">${esc(e.notiz)}</div>` : ""}</td>`;
      }).join("");
      return `<tr class="${we ? "we" : ""}"><th class="d">${d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</th>${cells}</tr>`;
    }).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Einsatzplan ${esc(monthLabel)}</title><style>
      @page { size: A4 ${drivers.length > 6 ? "landscape" : "portrait"}; margin: 10mm; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: system-ui, sans-serif; font-size: 10px; margin: 0; }
      h1 { font-size: 16px; margin: 0 0 6px; text-transform: capitalize; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      th, td { border: 1px solid #999; padding: 2px 4px; text-align: center; height: 17px; }
      th.d { text-align: left; width: 70px; white-space: nowrap; }
      tr.we { background: #eee; }
      td.dienst { background: #cdebd6; font-weight: 600; }
      td.frei { background: #f8a30d; color: #fff; font-weight: 600; }
      td.urlaub { background: #e57070; color: #fff; }
      td.krank { background: #d92f2f; color: #fff; font-weight: 600; }
      td.nicht_verfuegbar { background: #f7d2d2; color: #8a1c1c; }
      .n { font-size: 8px; color: #444; }
    </style></head><body><h1>e-cargo Einsatzplan – ${esc(monthLabel)}</h1>
    <table><thead><tr><th class="d">Datum</th>${head}</tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-40 text-center font-semibold capitalize">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!drivers.length} onClick={printPlan}><Printer className="h-4 w-4 mr-1" /> Drucken</Button>
        <Button size="sm" disabled={!drivers.length} onClick={() => drivers[0] && setEdit({ driverId: drivers[0].id, from: ymd(days[0]), to: ymd(days[days.length - 1]), status: "dienst", notiz: "", startTime: defaultStart })}>
          <CalendarRange className="h-4 w-4 mr-1" /> Zeitraum eintragen
        </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {SCHEDULE_STATUSES.map((s) => (
          <span key={s.key} className="flex items-center gap-1"><span className={cn("h-3 w-3 rounded-sm", s.cls)} />{s.label}</span>
        ))}
      </div>

      <TooltipProvider><div className="rounded-lg border overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card p-2 text-left min-w-36 border-b">Fahrer</th>
              {days.map((d) => {
                const we = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <th key={d.getDate()} className={cn("p-1 w-8 text-center border-b font-medium", we && "bg-muted", ymd(d) === today && "text-primary")}>
                    <div>{d.toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)}</div>
                    <div>{d.getDate()}</div>
                  </th>
                );
              })}
              <th className="sticky right-0 z-10 bg-card p-2 text-right min-w-24 border-b border-l">Arbeitszeit<div className="font-normal text-muted-foreground">Monat</div></th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((dr) => {
              const count = days.filter((d) => entries[`${dr.id}_${ymd(d)}`]?.status === "dienst").length;
              return (
                <tr key={dr.id}>
                  <td className="sticky left-0 z-10 bg-card p-2 border-b">
                    <div className="font-medium truncate max-w-36" title={dr.name}>{dr.name}</div>
                    <div className="text-muted-foreground">{count} Diensttage</div>
                  </td>
                  {days.map((d) => {
                    const key = ymd(d);
                    const e = entries[`${dr.id}_${key}`];
                    const meta = e && SCHEDULE_STATUSES.find((s) => s.key === e.status);
                    const we = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <td key={key} className={cn("border-b border-l p-0.5", we && "bg-muted/50")}>
                        {(() => { const st = stats[`${dr.id}_${key}`]; const btn = (
                        <Button variant="ghost"
                          onClick={() => open(dr.id, key)}
                          aria-label={`${dr.name}, ${d.toLocaleDateString("de-DE")}`}
                          className={cn("relative h-7 w-7 p-0 rounded-sm text-[10px] font-semibold hover:ring-2 hover:ring-ring", meta?.cls ?? "hover:bg-accent")}
                        >
                          {meta?.short ?? (st ? "•" : "")}
                          {e?.notiz && <span className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-current" />}
                        </Button>);
                          if (!st && !e) return btn;
                          return (
                            <Tooltip delayDuration={100}>
                              <TooltipTrigger asChild>{btn}</TooltipTrigger>
                              <TooltipContent className="text-xs space-y-0.5">
                                <div className="font-semibold">{d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })} · {dr.name}</div>
                                {meta && <div>{meta.label}{e?.notiz ? ` – ${e.notiz}` : ""}</div>}
                                {e?.start_time && <div>Startzeit: {e.start_time.slice(0, 5)} Uhr</div>}
                                {st && st.routes > 0 && <div>{st.stops} Stopps ({st.done} zugestellt){st.routes > 1 ? ` · ${st.routes} Routen` : ""}</div>}
                                {st && st.km > 0 && <div>{st.km.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km</div>}
                                {st && <div>Arbeitszeit: {st.sec > 0 ? `${hm(st.sec)} h` : "—"}</div>}
                              </TooltipContent>
                            </Tooltip>
                          ); })()}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-card p-2 text-right border-b border-l font-semibold tabular-nums">
                    {monthSec[dr.id] ? `${hm(monthSec[dr.id])} h` : <span className="text-muted-foreground font-normal">—</span>}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="sticky left-0 z-10 bg-card p-2 font-semibold">Verfügbar</td>
              {days.map((d) => {
                const n = drivers.filter((dr) => entries[`${dr.id}_${ymd(d)}`]?.status === "dienst").length;
                return <td key={ymd(d)} className={cn("text-center font-semibold border-l", n === 0 ? "text-destructive" : "text-primary")}>{n}</td>;
              })}
              <td className="sticky right-0 z-10 bg-card p-2 text-right border-l font-semibold tabular-nums">{hm(Object.values(monthSec).reduce((a, b) => a + b, 0))} h</td>
            </tr>
          </tbody>
        </table>
      </div></TooltipProvider>
      {!drivers.length && <p className="text-sm text-muted-foreground">Keine aktiven Fahrer vorhanden.</p>}

      <Dialog open={!!edit} onOpenChange={(v) => !v && !busy && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Verfügbarkeit eintragen</DialogTitle></DialogHeader>
          {edit && (
            <fieldset disabled={busy} className="space-y-3">
              <div>
                <Label>Fahrer</Label>
                <Select value={edit.driverId} onValueChange={(v) => setEdit({ ...edit, driverId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="schedule-from">Von</Label><Input id="schedule-from" type="date" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} /></div>
                <div><Label htmlFor="schedule-to">Bis</Label><Input id="schedule-to" type="date" value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} /></div>
              </div>
              <div>
                <Label>Nur an diesen Wochentagen (optional)</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {[1, 2, 3, 4, 5, 6, 0].map((n) => {
                    const on = (edit.weekdays ?? []).includes(n);
                    return (
                      <Button key={n} type="button" size="sm" variant={on ? "default" : "outline"} className="w-10 px-0"
                        onClick={() => setEdit({ ...edit, weekdays: on ? (edit.weekdays ?? []).filter((x) => x !== n) : [...(edit.weekdays ?? []), n] })}>
                        {["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][n]}
                      </Button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Keiner gewählt = jeder Tag im Zeitraum. Beispiel: jeden Mo + Do von Januar bis Dezember.</p>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v as ScheduleStatus | "leer" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_STATUSES.filter((s) => s.key === "dienst" || s.key === edit.status || enabled.includes(s.key)).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    <SelectItem value="leer">Eintrag entfernen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {edit.status !== "leer" && (
                <>
                  <div><Label htmlFor="schedule-start">Startzeit (optional)</Label><Input id="schedule-start" type="time" value={edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.value })} /></div>
                  <div><Label htmlFor="schedule-note">Notiz (optional)</Label><Input id="schedule-note" value={edit.notiz} onChange={(e) => setEdit({ ...edit, notiz: e.target.value })} placeholder="z. B. Treffpunkt am Depot" /></div>
                </>
              )}
              <Button className="w-full" onClick={save} disabled={busy}>Speichern</Button>
            </fieldset>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
