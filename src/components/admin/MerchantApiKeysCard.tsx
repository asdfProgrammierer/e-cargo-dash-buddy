import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Key, Trash2, Plus } from "lucide-react";

interface ApiKey {
  id: string;
  key_prefix: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface Props {
  merchantUserId: string;
}

export function MerchantApiKeysCard({ merchantUserId }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("Warenwirtschaft");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("merchant_api_keys")
      .select("id, key_prefix, label, created_at, last_used_at, revoked_at")
      .eq("user_id", merchantUserId)
      .order("created_at", { ascending: false });
    setKeys((data ?? []) as ApiKey[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [merchantUserId]);

  const createKey = async () => {
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-merchant-api-key", {
      body: { user_id: merchantUserId, label: label || "API-Key" },
    });
    setCreating(false);
    if (error || !data?.token) {
      toast.error("Key konnte nicht erstellt werden");
      return;
    }
    setNewToken(data.token as string);
    setLabel("Warenwirtschaft");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Diesen API-Key wirklich widerrufen? Bestehende Integrationen können danach nicht mehr senden.")) return;
    const { error } = await (supabase as any)
      .from("merchant_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Widerruf fehlgeschlagen");
    else { toast.success("Key widerrufen"); load(); }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Kopiert");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key className="h-4 w-4" /> API-Zugang (Warenwirtschaft)
        </CardTitle>
        <CardDescription>
          Erlaubt einer externen Warenwirtschaft, Bestellungen per REST-API an e-cargo zu pushen.
          Endpoint: <code className="text-xs">POST /functions/v1/external-create-order</code> · Header: <code className="text-xs">X-API-Key</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Bezeichnung</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Warenwirtschaft Lager" />
          </div>
          <Button onClick={createKey} disabled={creating} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {creating ? "Erstellen…" : "Neuen Key erstellen"}
          </Button>
        </div>

        {newToken && (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-medium text-primary">
              ⚠️ Dieser Key wird nur einmal angezeigt – jetzt kopieren und sicher speichern!
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1.5 text-xs font-mono">{newToken}</code>
              <Button size="sm" variant="outline" onClick={() => copy(newToken)} className="gap-1">
                <Copy className="h-3.5 w-3.5" /> Kopieren
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNewToken(null)}>Schließen</Button>
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine API-Keys angelegt.</p>
          ) : (
            keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{k.label}</span>
                    {k.revoked_at && <Badge variant="destructive">Widerrufen</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{k.key_prefix}…</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Erstellt {new Date(k.created_at).toLocaleDateString("de-DE")}
                    {k.last_used_at && ` · zuletzt genutzt ${new Date(k.last_used_at).toLocaleString("de-DE")}`}
                  </p>
                </div>
                {!k.revoked_at && (
                  <Button size="sm" variant="ghost" onClick={() => revoke(k.id)} className="gap-1 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Widerrufen
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}