import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, KeyRound, Trash2, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface WmsKey {
  id: string;
  label: string | null;
  key_prefix: string;
  active: boolean;
  merchant_code: string;
  created_at: string;
  last_used_at: string | null;
}

interface Props {
  profileId: string;
  userId: string;
  merchantCode: string | null;
}

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wms-create-shipment`;

export function WmsApiKeysCard({ profileId, userId, merchantCode }: Props) {
  const [keys, setKeys] = useState<WmsKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("wms_api_keys")
      .select("id, label, key_prefix, active, merchant_code, created_at, last_used_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) toast.error("API-Keys konnten nicht geladen werden");
    else setKeys((data ?? []) as WmsKey[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const createKey = async () => {
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-wms-key", {
      body: { profile_id: profileId, label: label.trim() || null },
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Erstellen fehlgeschlagen");
      return;
    }
    setNewKey((data as any).api_key);
    setLabel("");
    toast.success("API-Key erstellt");
    load();
  };

  const toggleActive = async (k: WmsKey) => {
    const { error } = await supabase
      .from("wms_api_keys")
      .update({ active: !k.active })
      .eq("id", k.id);
    if (error) {
      toast.error("Aktualisierung fehlgeschlagen");
      return;
    }
    setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, active: !x.active } : x)));
  };

  const removeKey = async (k: WmsKey) => {
    const { error } = await supabase.from("wms_api_keys").delete().eq("id", k.id);
    if (error) {
      toast.error("Löschen fehlgeschlagen");
      return;
    }
    setKeys((prev) => prev.filter((x) => x.id !== k.id));
    toast.success("API-Key gelöscht");
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("In Zwischenablage kopiert");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          WMS-API-Zugang
        </CardTitle>
        <CardDescription>
          Eigene API-Schlüssel für die Lagerprogramm-Anbindung dieses Händlers. Der Händlercode wird
          automatisch aus dem Schlüssel abgeleitet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Händlercode:</span>
            <span className="font-mono font-medium">{merchantCode || "–"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Endpoint:</span>
            <code className="text-xs break-all">{ENDPOINT}</code>
            <Button size="icon" variant="ghost" onClick={() => copy(ENDPOINT)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Header: <code>x-wms-api-key</code>
          </p>
        </div>

        {!merchantCode ? (
          <p className="text-sm text-muted-foreground">
            Für diesen Händler ist noch kein Händlercode hinterlegt. Bitte zuerst einen Händlercode setzen.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">Bezeichnung (optional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z. B. Lagerprogramm"
              />
            </div>
            <Button onClick={createKey} disabled={creating} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {creating ? "Erzeuge…" : "Neuen API-Key erzeugen"}
            </Button>
          </div>
        )}

        {newKey && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium">Neuer API-Key — nur jetzt sichtbar!</p>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all flex-1">{newKey}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(newKey)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setNewKey(null)}>
              Verstanden
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine API-Keys vorhanden.</p>
          ) : (
            keys.map((k) => (
              <div
                key={k.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium truncate">{k.label || "Ohne Bezeichnung"}</p>
                  <p className="font-mono text-xs text-muted-foreground truncate">{k.key_prefix}…</p>
                  <p className="text-xs text-muted-foreground">
                    Erstellt {new Date(k.created_at).toLocaleDateString("de-DE")} · Zuletzt genutzt{" "}
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString("de-DE") : "nie"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={k.active ? "default" : "secondary"}>
                    {k.active ? "Aktiv" : "Deaktiviert"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(k)}>
                    {k.active ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>API-Key löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Anbindungen, die diesen Schlüssel nutzen, können danach keine Sendungen mehr anlegen.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeKey(k)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
