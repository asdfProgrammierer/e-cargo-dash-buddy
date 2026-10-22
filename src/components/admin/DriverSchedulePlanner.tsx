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
import { SCHEDULE_STATUSES, type ScheduleStatus } from "@/lib/driverSchedule";

interface Driver { id: string; name: string }
interface Entry { driver_id: string; datum: string; status: ScheduleStatus; notiz: string | null }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
interface DayStat { routes: number; stops: number; done: number; km: number; sec: number }
const hm = (sec: number) => { const m = Math.round(sec / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };

export function DriverSchedulePlanner({ drivers }: { drivers: Driver[] }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [edit, setEdit] = useState<{ driverId: string; from: string; to: string; status: ScheduleStatus | "leer"; notiz: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Record<string, DayStat>>({});
  const [monthSec, setMonthSec] = useState<Record<string, number>>({});

  const days = useMemo(() => {
    const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));
  }, [month]);

  const load = async () => {
    const { data, error } = await supabase.from("driver_schedules")
      .select("driver_id, datum, status, notiz")
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
      supabase.from("driver_work_sessions").select("driver_id, route_id, started_at, ended_at")
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
    for (const w of (sessions ?? []) as any[]) {
      const st = new Date(w.started_at);
      const sec = Math.max(0, ((w.ended_at ? new Date(w.ended_at).getTime() : Date.now()) - st.getTime()) / 1000);
      const day = st.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
      if (day < from || day > to) continue;
      get(`${w.driver_id}_${day}`).sec += sec;
      monthly[w.driver_id] = (monthly[w.driver_id] ?? 0) + sec;
    }
    setStats(map); setMonthSec(monthly);
  };

  const open = (driverId: string, datum: string) => {
    const e = entries[`${driverId}_${datum}`];
    setEdit({ driverId, from: datum, to: datum, status: e?.status ?? "dienst", notiz: e?.notiz ?? "" });
  };

  const save = async () => {
    if (!edit) return;
    if (edit.to < edit.from) { toast.error("Enddatum liegt vor Startdatum"); return; }
    const dates: string[] = [];
    for (let d = new Date(edit.from + "T12:00:00"); ymd(d) <= edit.to; d.setDate(d.getDate() + 1)) dates.push(ymd(d));
    if (dates.length > 366) { toast.error("Maximal ein Jahr auf einmal"); return; }
    setBusy(true);
    const { error } = edit.status === "leer"
      ? await supabase.from("driver_schedules").delete().eq("driver_id", edit.driverId).in("datum", dates)
      : await supabase.from("driver_schedules").upsert(
          dates.map((datum) => ({ driver_id: edit.driverId, datum, status: edit.status, notiz: edit.notiz.trim() || null })),
          { onConflict: "driver_id,datum" });
    setBusy(false);
    if (error) { toast.error("Speichern fehlgeschlagen: " + error.message); return; }
    toast.success("Plan gespeichert");
    setEdit(null);
    load();
  };

  const today = ymd(new Date());
  const monthLabel = month.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const printPlan = () => {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Pop-up wurde blockiert"); return; }
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
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
        <Button size="sm" disabled={!drivers.length} onClick={() => drivers[0] && setEdit({ driverId: drivers[0].id, from: today, to: today, status: "urlaub", notiz: "" })}>
          <CalendarRange className="h-4 w-4 mr-1" /> Zeitraum eintragen
        </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {SCHEDULE_STATUSES.map((s) => (
          <span key={s.key} className="flex items-center gap-1"><span className={cn("h-3 w-3 rounded-sm", s.cls)} />{s.label}</span>
        ))}
      </div>

      <div className="rounded-lg border overflow-x-auto">
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
                        <button
                          onClick={() => open(dr.id, key)}
                          title={meta ? `${meta.label}${e?.notiz ? ` – ${e.notiz}` : ""}` : "Eintragen"}
                          className={cn("h-7 w-7 rounded-sm text-[10px] font-semibold hover:ring-2 hover:ring-ring", meta?.cls ?? "hover:bg-accent")}
                        >
                          {meta?.short ?? ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <td className="sticky left-0 z-10 bg-card p-2 font-semibold">Verfügbar</td>
              {days.map((d) => {
                const n = drivers.filter((dr) => entries[`${dr.id}_${ymd(d)}`]?.status === "dienst").length;
                return <td key={ymd(d)} className={cn("text-center font-semibold border-l", n === 0 ? "text-destructive" : "text-primary")}>{n}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {!drivers.length && <p className="text-sm text-muted-foreground">Keine aktiven Fahrer vorhanden.</p>}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Verfügbarkeit eintragen</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div>
                <Label>Fahrer</Label>
                <Select value={edit.driverId} onValueChange={(v) => setEdit({ ...edit, driverId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Von</Label><Input type="date" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value, to: e.target.value > edit.to ? e.target.value : edit.to })} /></div>
                <div><Label>Bis</Label><Input type="date" value={edit.to} min={edit.from} onChange={(e) => setEdit({ ...edit, to: e.target.value })} /></div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v as ScheduleStatus | "leer" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    <SelectItem value="leer">Eintrag entfernen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {edit.status !== "leer" && (
                <div><Label>Notiz (optional)</Label><Input value={edit.notiz} onChange={(e) => setEdit({ ...edit, notiz: e.target.value })} placeholder="z. B. ab 12 Uhr" /></div>
              )}
              <Button className="w-full" onClick={save} disabled={busy}>Speichern</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
