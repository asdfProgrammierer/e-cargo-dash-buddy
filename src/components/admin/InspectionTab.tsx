import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, ClipboardCheck, CheckCircle2, AlertTriangle } from "lucide-react";

interface Inspection {
  id: string;
  inspected_by: string;
  inspection_date: string;
  reifen_ok: boolean; reifen_notiz: string | null;
  bremsen_ok: boolean; bremsen_notiz: string | null;
  lichter_ok: boolean; lichter_notiz: string | null;
  ausstattung_ok: boolean; ausstattung_notiz: string | null;
  spiegel_ok: boolean; spiegel_notiz: string | null;
  sauberkeit_ok: boolean; sauberkeit_notiz: string | null;
  allgemein_notiz: string | null;
  created_at: string;
}

const CHECKLIST_ITEMS = [
  { key: "reifen", label: "Reifen", desc: "Profil, Luftdruck, Beschädigungen" },
  { key: "bremsen", label: "Bremsen", desc: "Funktion, Bremsbeläge, Flüssigkeit" },
  { key: "lichter", label: "Lichter", desc: "Scheinwerfer, Rücklichter, Blinker" },
  { key: "ausstattung", label: "Ausstattung", desc: "Warndreieck, Verbandskasten, Ladungssicherung" },
  { key: "spiegel", label: "Spiegel", desc: "Einstellung, Sauberkeit, Beschädigungen" },
  { key: "sauberkeit", label: "Sauberkeit", desc: "Innen- und Außenreinigung" },
] as const;

type CheckKey = typeof CHECKLIST_ITEMS[number]["key"];

const emptyChecks: Record<string, boolean | string> = {
  reifen_ok: false, reifen_notiz: "",
  bremsen_ok: false, bremsen_notiz: "",
  lichter_ok: false, lichter_notiz: "",
  ausstattung_ok: false, ausstattung_notiz: "",
  spiegel_ok: false, spiegel_notiz: "",
  sauberkeit_ok: false, sauberkeit_notiz: "",
};

export function InspectionTab({ vehicleId }: { vehicleId: string }) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [inspectedBy, setInspectedBy] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().slice(0, 10));
  const [checks, setChecks] = useState<Record<string, boolean | string>>(emptyChecks);
  const [allgemeinNotiz, setAllgemeinNotiz] = useState("");
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("vehicle_inspections")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("inspection_date", { ascending: false });
    setInspections((data as Inspection[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [vehicleId]);

  // Check if inspection is overdue (>14 days since last)
  const lastInspection = inspections[0];
  const daysSinceLast = lastInspection
    ? Math.floor((Date.now() - new Date(lastInspection.inspection_date).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const isOverdue = daysSinceLast > 14;

  const handleSave = async () => {
    if (!inspectedBy.trim()) { toast.error("Prüfer ist erforderlich"); return; }
    const payload: any = {
      vehicle_id: vehicleId,
      inspected_by: inspectedBy,
      inspection_date: inspectionDate,
      allgemein_notiz: allgemeinNotiz || null,
    };
    CHECKLIST_ITEMS.forEach(({ key }) => {
      payload[`${key}_ok`] = checks[`${key}_ok`] ?? false;
      payload[`${key}_notiz`] = (checks[`${key}_notiz`] as string) || null;
    });

    const { error } = await supabase.from("vehicle_inspections").insert(payload);
    if (error) { toast.error("Fehler beim Speichern"); return; }
    toast.success("Kontrolle gespeichert");
    setOpen(false);
    setInspectedBy(""); setChecks(emptyChecks); setAllgemeinNotiz("");
    setInspectionDate(new Date().toISOString().slice(0, 10));
    load();
  };

  const allOk = (insp: Inspection) =>
    CHECKLIST_ITEMS.every(({ key }) => (insp as any)[`${key}_ok`]);

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <Card className={isOverdue ? "border-destructive/50 bg-destructive/5" : "border-success/50 bg-success/5"}>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {isOverdue ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-success" />
            )}
            <div>
              <p className="font-medium text-sm">
                {isOverdue ? "Kontrolle überfällig!" : "Kontrolle aktuell"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lastInspection
                  ? `Letzte Kontrolle: ${new Date(lastInspection.inspection_date).toLocaleDateString("de-DE")} (vor ${daysSinceLast} Tagen)`
                  : "Noch keine Kontrolle durchgeführt"}
              </p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant={isOverdue ? "destructive" : "default"}>
                <Plus className="mr-2 h-4 w-4" />Neue Kontrolle
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Fahrzeugkontrolle durchführen</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Prüfer *</Label><Input value={inspectedBy} onChange={(e) => setInspectedBy(e.target.value)} placeholder="Name" /></div>
                  <div><Label>Datum</Label><Input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} /></div>
                </div>

                <div className="space-y-3">
                  {CHECKLIST_ITEMS.map(({ key, label, desc }) => (
                    <div key={key} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={checks[`${key}_ok`] as boolean}
                          onCheckedChange={(v) => setChecks({ ...checks, [`${key}_ok`]: !!v })}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                        <Badge variant={(checks[`${key}_ok`] as boolean) ? "default" : "secondary"}>
                          {(checks[`${key}_ok`] as boolean) ? "OK" : "Offen"}
                        </Badge>
                      </div>
                      <Input
                        placeholder={`Notiz zu ${label}...`}
                        className="text-sm h-8"
                        value={(checks[`${key}_notiz`] as string) ?? ""}
                        onChange={(e) => setChecks({ ...checks, [`${key}_notiz`]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <Label>Allgemeine Bemerkungen</Label>
                  <Textarea value={allgemeinNotiz} onChange={(e) => setAllgemeinNotiz(e.target.value)} rows={2} />
                </div>

                <Button className="w-full" onClick={handleSave}>Kontrolle speichern</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* History */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Kontrollhistorie</h3>
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Lade...</p>
        ) : inspections.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Noch keine Kontrollen durchgeführt</p>
        ) : (
          <div className="space-y-2">
            {inspections.map((insp) => (
              <Card
                key={insp.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setSelectedInspection(selectedInspection?.id === insp.id ? null : insp)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ClipboardCheck className={`h-4 w-4 ${allOk(insp) ? "text-success" : "text-warning"}`} />
                      <div>
                        <p className="text-sm font-medium">{new Date(insp.inspection_date).toLocaleDateString("de-DE")}</p>
                        <p className="text-xs text-muted-foreground">Prüfer: {insp.inspected_by}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {CHECKLIST_ITEMS.map(({ key, label }) => (
                        <Badge
                          key={key}
                          variant={(insp as any)[`${key}_ok`] ? "default" : "destructive"}
                          className="text-[10px] px-1.5"
                        >
                          {label.slice(0, 3)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {selectedInspection?.id === insp.id && (
                    <div className="mt-4 space-y-2 border-t pt-3">
                      {CHECKLIST_ITEMS.map(({ key, label }) => {
                        const ok = (insp as any)[`${key}_ok`];
                        const notiz = (insp as any)[`${key}_notiz`];
                        return (
                          <div key={key} className="flex items-start gap-2 text-sm">
                            {ok ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5" /> : <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />}
                            <div>
                              <span className="font-medium">{label}:</span>{" "}
                              <span className={ok ? "text-success" : "text-destructive"}>{ok ? "OK" : "Mangel"}</span>
                              {notiz && <p className="text-xs text-muted-foreground">{notiz}</p>}
                            </div>
                          </div>
                        );
                      })}
                      {insp.allgemein_notiz && (
                        <div className="text-sm mt-2 pt-2 border-t">
                          <span className="font-medium">Bemerkungen:</span>{" "}
                          <span className="text-muted-foreground">{insp.allgemein_notiz}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
