import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SCHEDULE_COLORS, colorOf, statusKeyFromLabel, useScheduleStatuses, type ScheduleStatusDef } from "@/lib/driverSchedule";
import { scheduleStartTime } from "@/lib/driverScheduleDates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Row = ScheduleStatusDef & { isNew?: boolean };

const ScheduleSettingsPage = () => {
  const [startTime, setStartTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { statuses, reload } = useScheduleStatuses();
  const [rows, setRows] = useState<Row[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);

  useEffect(() => { setRows(statuses); setRemoved([]); }, [statuses]);
  useEffect(() => {
    supabase.from("driver_schedule_settings").select("default_start_time").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (error) toast.error("Einstellungen konnten nicht geladen werden");
      else if (data) setStartTime(data.default_start_time?.slice(0, 5) ?? "");
      setLoading(false);
    });
  }, []);

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows([...rows, { key: "", label: "", short: "", color: "gruen", is_duty: true, active: true, sort_order: rows.length + 1, isNew: true }]);
  const remove = (i: number) => { const r = rows[i]; if (!r.isNew) setRemoved([...removed, r.key]); setRows(rows.filter((_, j) => j !== i)); };

  const save = async () => {
    let time: string | null;
    try { time = scheduleStartTime(startTime); } catch (e) { toast.error((e as Error).message); return; }
    if (rows.some((r) => !r.label.trim())) { toast.error("Jeder Status braucht einen Namen."); return; }
    if (!rows.some((r) => r.active)) { toast.error("Mindestens ein Status muss aktiv sein."); return; }
    const used = new Set(rows.filter((r) => !r.isNew).map((r) => r.key));
    const payload = rows.map((r, i) => {
      let key = r.key;
      if (r.isNew) { const base = statusKeyFromLabel(r.label); key = base; let n = 2; while (used.has(key)) key = `${base}_${n++}`; used.add(key); }
      return { key, label: r.label.trim(), short: (r.short.trim() || r.label.trim().slice(0, 2)).toUpperCase().slice(0, 3), color: r.color, is_duty: r.is_duty, active: r.active, sort_order: i + 1 };
    });
    setSaving(true);
    const errs: string[] = [];
    const s1 = await supabase.from("driver_schedule_settings").upsert({ id: 1, default_start_time: time, updated_at: new Date().toISOString() });
    if (s1.error) errs.push("Startzeit");
    const s2 = await supabase.from("driver_schedule_statuses").upsert(payload);
    if (s2.error) errs.push("Status");
    const blocked: string[] = [];
    for (const key of removed) {
      const { count } = await supabase.from("driver_schedules").select("id", { count: "exact", head: true }).eq("status", key);
      if (count && count > 0) {
        await supabase.from("driver_schedule_statuses").update({ active: false }).eq("key", key);
        blocked.push(statuses.find((s) => s.key === key)?.label ?? key);
      } else {
        const { error } = await supabase.from("driver_schedule_statuses").delete().eq("key", key);
        if (error) errs.push("Löschen");
      }
    }
    setSaving(false);
    await reload();
    if (errs.length) toast.error(`Speichern fehlgeschlagen (${errs.join(", ")})`);
    else toast.success("Einstellungen gespeichert");
    if (blocked.length) toast.info(`${blocked.join(", ")} ist noch im Plan eingetragen und wurde deshalb nur ausgeblendet.`);
  };

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />
      <Card className="max-w-3xl">
        <CardHeader><CardTitle className="text-base">Einsatzplan</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="default-start">Standard-Startzeit</Label>
            <Input id="default-start" type="time" value={startTime} disabled={loading} onChange={(e) => setStartTime(e.target.value)} className="max-w-[10rem]" />
            <p className="text-xs text-muted-foreground">Wird bei neuen Einträgen vorausgefüllt. Leer lassen für keine Vorgabe.</p>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <div className="hidden sm:grid grid-cols-[1fr_4rem_9rem_5rem_5rem_2.5rem] gap-2 px-1 text-xs text-muted-foreground">
              <span>Name</span><span>Kürzel</span><span>Farbe</span><span>Zählt als Dienst</span><span>Auswählbar</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={r.key || `new-${i}`} className="grid grid-cols-2 sm:grid-cols-[1fr_4rem_9rem_5rem_5rem_2.5rem] items-center gap-2 rounded-md border border-border p-2">
                <Input aria-label="Name" value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="z. B. Potpourri" className="col-span-2 sm:col-span-1" />
                <Input aria-label="Kürzel" value={r.short} maxLength={3} onChange={(e) => update(i, { short: e.target.value })} placeholder="PP" />
                <Select value={r.color} onValueChange={(v) => update(i, { color: v })}>
                  <SelectTrigger aria-label="Farbe"><span className="flex items-center gap-2"><span className={cn("h-3 w-3 rounded-sm", colorOf(r.color).cls)} /><SelectValue /></span></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCHEDULE_COLORS).map(([k, c]) => (
                      <SelectItem key={k} value={k}><span className="flex items-center gap-2"><span className={cn("h-3 w-3 rounded-sm", c.cls)} />{c.label}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Switch aria-label="Zählt als Dienst" checked={r.is_duty} onCheckedChange={(v) => update(i, { is_duty: v })} />
                <Switch aria-label="Auswählbar" checked={r.active} onCheckedChange={(v) => update(i, { active: v })} />
                <Button variant="ghost" size="icon" aria-label={`${r.label || "Status"} löschen`} onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Status hinzufügen</Button>
            <p className="text-xs text-muted-foreground">„Zählt als Dienst": Fahrer ist an dem Tag verfügbar (Diensttage, Summenzeile, Routenplanung). Status, die noch im Plan eingetragen sind, werden beim Löschen nur ausgeblendet.</p>
          </div>
          <Button onClick={save} disabled={saving || loading}>{saving ? "Speichert…" : "Speichern"}</Button>
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default ScheduleSettingsPage;
