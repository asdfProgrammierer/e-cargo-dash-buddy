import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Send, Loader2, Bell } from "lucide-react";
import { toast } from "sonner";

interface MerchantOption {
  user_id: string;
  firma_name: string | null;
  ansprechpartner: string | null;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  target_user_id: string | null;
  created_at: string;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [notes, setNotes] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [audience, setAudience] = useState<"all" | "merchant">("all");
  const [targetId, setTargetId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = async () => {
    const [{ data: m }, { data: n }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, firma_name, ansprechpartner")
        .is("parent_user_id", null)
        .order("firma_name", { ascending: true }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setMerchants((m ?? []) as MerchantOption[]);
    setNotes((n ?? []) as NotificationRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Titel und Nachricht sind erforderlich");
      return;
    }
    if (audience === "merchant" && !targetId) {
      toast.error("Bitte einen Händler auswählen");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("notifications").insert({
      title: title.trim(),
      body: body.trim(),
      audience,
      target_user_id: audience === "merchant" ? targetId : null,
      created_by: user?.id ?? null,
    });
    setSending(false);
    if (error) {
      toast.error("Konnte nicht gesendet werden");
      return;
    }
    toast.success("Benachrichtigung gesendet");

    // Push parallel zur In-App-Benachrichtigung
    try {
      const pushBody = {
        payload: {
          title: title.trim(),
          body: body.trim().slice(0, 240),
          url: "/dashboard",
          tag: `notif-${Date.now()}`,
        },
        ...(audience === "merchant" && targetId
          ? { user_ids: [targetId] }
          : { audience: "all" as const }),
      };
      if (audience === "all") {
        // Für "alle" lassen wir send-push selbst die User über die merchant-Subscriptions hinweg ermitteln.
        // Da audience:"all" in der Edge Function noch nicht unterstützt ist, listen wir hier alle profiles auf.
        const { data: profileRows } = await supabase.from("profiles").select("user_id");
        const ids = (profileRows ?? []).map((p) => p.user_id).filter(Boolean);
        if (ids.length > 0) {
          await supabase.functions.invoke("send-push", {
            body: { user_ids: ids, payload: pushBody.payload },
          });
        }
      } else {
        await supabase.functions.invoke("send-push", { body: pushBody });
      }
    } catch (pe) {
      console.error("push send failed", pe);
    }

    setTitle("");
    setBody("");
    setTargetId("");
    setAudience("all");
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Diese Benachrichtigung löschen?")) return;
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) { toast.error("Löschen fehlgeschlagen"); return; }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const merchantLabel = (id: string) => {
    const m = merchants.find((x) => x.user_id === id);
    return m ? (m.firma_name || m.ansprechpartner || id) : id;
  };

  return (
    <AdminLayout title="Benachrichtigungen">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Neue Benachrichtigung
            </CardTitle>
            <CardDescription>Versende eine Mitteilung an alle oder einen einzelnen Händler.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Empfänger</Label>
              <RadioGroup value={audience} onValueChange={(v) => setAudience(v as "all" | "merchant")} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="aud-all" />
                  <Label htmlFor="aud-all" className="cursor-pointer">Alle Händler</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="merchant" id="aud-one" />
                  <Label htmlFor="aud-one" className="cursor-pointer">Einzelner Händler</Label>
                </div>
              </RadioGroup>
            </div>
            {audience === "merchant" && (
              <div className="space-y-2">
                <Label>Händler</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger><SelectValue placeholder="Händler auswählen" /></SelectTrigger>
                  <SelectContent>
                    {merchants.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.firma_name || m.ansprechpartner || m.user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label>Nachricht</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} />
            </div>
            <Button onClick={handleSend} disabled={sending} className="w-full sm:w-auto">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Senden
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Verlauf
            </CardTitle>
            <CardDescription>Die letzten 100 Benachrichtigungen.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Benachrichtigungen.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{n.title}</p>
                          <Badge variant={n.audience === "all" ? "default" : "secondary"}>
                            {n.audience === "all" ? "Alle" : merchantLabel(n.target_user_id ?? "")}
                          </Badge>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          {new Date(n.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(n.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}