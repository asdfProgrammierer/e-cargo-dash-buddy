import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { useDeliveryModes, type DeliveryMode } from "@/hooks/useDeliveryModes";

const DeliveryModesPage = () => {
  const { modes, loading, reload } = useDeliveryModes();
  const [drafts, setDrafts] = useState<Record<string, Partial<DeliveryMode>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const merged = (m: DeliveryMode): DeliveryMode => ({ ...m, ...(drafts[m.id] ?? {}) });

  const setField = <K extends keyof DeliveryMode>(id: string, key: K, value: DeliveryMode[K]) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
  };

  const save = async (m: DeliveryMode) => {
    const merged = { ...m, ...(drafts[m.id] ?? {}) };
    setSavingId(m.id);
    const { error } = await supabase
      .from("delivery_modes")
      .update({
        label: merged.label.trim() || m.label,
        active: merged.active,
        photo_required: merged.photo_required,
        signature_required: merged.signature_required,
        recipient_name_required: merged.recipient_name_required,
        sort_order: Number.isFinite(merged.sort_order) ? merged.sort_order : m.sort_order,
      })
      .eq("id", m.id);
    setSavingId(null);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success(`${merged.label} gespeichert`);
    setDrafts((d) => {
      const n = { ...d };
      delete n[m.id];
      return n;
    });
    reload();
  };

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="text-base">Übergabe-Modi (Fahrer-App)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Steuere welche Übergabe-Arten Fahrer auswählen können und welche Pflichtfelder
            (Foto, Unterschrift, Empfängername) jeweils erforderlich sind.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {modes
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((raw) => {
                  const m = merged(raw);
                  const dirty = !!drafts[raw.id];
                  return (
                    <div
                      key={raw.id}
                      className="border rounded-lg p-4 space-y-4 bg-card"
                    >
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex-1 min-w-[200px]">
                          <Label className="text-xs text-muted-foreground">Bezeichnung</Label>
                          <Input
                            value={m.label}
                            onChange={(e) => setField(raw.id, "label", e.target.value)}
                            className="mt-1"
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Schlüssel: <code>{raw.key}</code>
                          </p>
                        </div>
                        <div className="w-24">
                          <Label className="text-xs text-muted-foreground">Reihenfolge</Label>
                          <Input
                            type="number"
                            value={m.sort_order}
                            onChange={(e) =>
                              setField(raw.id, "sort_order", Number(e.target.value))
                            }
                            className="mt-1"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={m.active}
                            onCheckedChange={(v) => setField(raw.id, "active", v)}
                            id={`active-${raw.id}`}
                          />
                          <Label htmlFor={`active-${raw.id}`} className="cursor-pointer">
                            Aktiv
                          </Label>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-4">
                        <ToggleRow
                          id={`photo-${raw.id}`}
                          label="Foto Pflicht"
                          desc="Fahrer muss ein Foto aufnehmen"
                          checked={m.photo_required}
                          onChange={(v) => setField(raw.id, "photo_required", v)}
                        />
                        <ToggleRow
                          id={`sig-${raw.id}`}
                          label="Unterschrift Pflicht"
                          desc="Empfänger muss unterschreiben"
                          checked={m.signature_required}
                          onChange={(v) => setField(raw.id, "signature_required", v)}
                        />
                        <ToggleRow
                          id={`name-${raw.id}`}
                          label="Empfängername Pflicht"
                          desc="Name (z.B. Nachbar) muss eingegeben werden"
                          checked={m.recipient_name_required}
                          onChange={(v) => setField(raw.id, "recipient_name_required", v)}
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={!dirty || savingId === raw.id}
                          onClick={() => save(raw)}
                        >
                          {savingId === raw.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Speichern
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

function ToggleRow({
  id,
  label,
  desc,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="border rounded-md p-3 flex items-start justify-between gap-3 bg-muted/30">
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default DeliveryModesPage;