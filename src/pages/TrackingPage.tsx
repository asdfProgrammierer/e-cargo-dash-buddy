import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package, MapPin, CheckCircle2, Clock, AlertCircle, Lock, Truck } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const STORAGE_PREFIX = "ecargo_tracking_session_";

const INSTRUCTION_OPTIONS: { value: string; label: string }[] = [
  { value: "nachbar", label: "Bei Nachbar abgeben" },
  { value: "hausflur", label: "Im Hausflur ablegen" },
  { value: "sicherer_ort", label: "An einem sicheren Ort ablegen" },
  { value: "garage", label: "In Garage / Briefkasten" },
  { value: "keine", label: "Keine Sonderwünsche" },
];

const plzSchema = z.string().trim().regex(/^\d{4,5}$/u, "Bitte eine gültige Postleitzahl eingeben");

interface OrderInfo {
  auftragsNr: string;
  status: string;
  statusLabel: string;
  empfaengerName: string;
  empfaengerAdresse: string | null;
  empfaengerPlz: string | null;
  empfaengerStadt: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  haendlerName: string;
  eta: {
    window: string;
    center: string;
    date: string;
    fromIso: string;
    toIso: string;
    centerIso: string;
  } | null;
  delivery?: {
    mode: string | null;
    recipient: string | null;
    note: string | null;
  } | null;
  deliveryAttempts?: number;
  maxDeliveryAttempts?: number;
}
interface HistoryEntry {
  status: string;
  statusLabel: string;
  reason: string | null;
  createdAt: string;
}
interface InstructionsState {
  options: string[];
  freetext: string;
  updatedAt: string | null;
}
interface TrackingResponse {
  order: OrderInfo;
  history: HistoryEntry[];
  instructions: InstructionsState;
  editable: boolean;
}

function getStoredSession(token: string): { session: string; expiresAt: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + token);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { session: string; expiresAt: number };
    if (!parsed.session || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(STORAGE_PREFIX + token);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeSession(token: string, session: string, expiresInSec: number) {
  sessionStorage.setItem(
    STORAGE_PREFIX + token,
    JSON.stringify({ session, expiresAt: Date.now() + expiresInSec * 1000 })
  );
}

function clearSession(token: string) {
  sessionStorage.removeItem(STORAGE_PREFIX + token);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "zugestellt":
      return "default";
    case "nicht_zugestellt":
    case "storniert":
      return "destructive";
    case "unterwegs":
      return "secondary";
    default:
      return "outline";
  }
}

const DELIVERY_MODE_LABEL: Record<string, string> = {
  persoenlich: "Persönlich übergeben",
  briefkasten: "In den Briefkasten gelegt",
  nachbar: "Beim Nachbarn abgegeben",
  bemerkung: "Mit Bemerkung zugestellt",
};

function formatDeliveryMode(mode: string | null | undefined): string | null {
  if (!mode) return null;
  return DELIVERY_MODE_LABEL[mode] ?? mode;
}

async function callFunction<T>(
  path: string,
  init: RequestInit & { sessionJwt?: string } = {}
): Promise<{ ok: boolean; status: number; data: T | { error?: string } }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.sessionJwt) {
    headers["Authorization"] = `Bearer ${init.sessionJwt}`;
  } else {
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, { ...init, headers });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}

export default function TrackingPage() {
  const { token = "" } = useParams<{ token: string }>();
  const { toast } = useToast();

  const isValidToken = useMemo(() => /^[a-f0-9]{64}$/.test(token), [token]);

  const [session, setSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [plz, setPlz] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [freetext, setFreetext] = useState("");
  const [saving, setSaving] = useState(false);

  // Versuche bestehende Session zu nutzen
  useEffect(() => {
    if (!isValidToken) return;
    const stored = getStoredSession(token);
    if (stored) setSession(stored.session);
  }, [isValidToken, token]);

  // Daten laden, sobald Session vorhanden
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await callFunction<TrackingResponse>("tracking-data", {
        method: "GET",
        sessionJwt: session,
      });
      if (cancelled) return;
      if (res.ok && "order" in res.data) {
        const td = res.data as TrackingResponse;
        setData(td);
        setSelectedOptions(td.instructions.options ?? []);
        setFreetext(td.instructions.freetext ?? "");
        setError(null);
      } else if (res.status === 401) {
        clearSession(token);
        setSession(null);
      } else {
        setError("Sendungsdaten konnten nicht geladen werden.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, token]);

  if (!isValidToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-destructive" />Ungültiger Link</CardTitle>
            <CardDescription>Der Sendungsverfolgungs-Link ist nicht korrekt.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const parsed = plzSchema.safeParse(plz);
    if (!parsed.success) {
      toast({ title: "Ungültige PLZ", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setVerifying(true);
    setError(null);
    const res = await callFunction<{ session: string; expiresIn: number }>("verify-tracking-access", {
      method: "POST",
      body: JSON.stringify({ token, plz: parsed.data }),
    });
    setVerifying(false);
    if (res.ok && "session" in res.data) {
      const { session: jwt, expiresIn } = res.data as { session: string; expiresIn: number };
      storeSession(token, jwt, expiresIn);
      setSession(jwt);
    } else if (res.status === 401) {
      setError("Die eingegebene PLZ stimmt nicht mit der Bestellung überein.");
    } else if (res.status === 404) {
      setError("Sendung nicht gefunden.");
    } else {
      setError("Verifizierung fehlgeschlagen. Bitte später erneut versuchen.");
    }
  }

  async function handleSaveInstructions() {
    if (!session) return;
    setSaving(true);
    const res = await callFunction<{ success: boolean }>("update-delivery-instructions", {
      method: "POST",
      sessionJwt: session,
      body: JSON.stringify({ options: selectedOptions, freetext }),
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Lieferanweisungen gespeichert", description: "Vielen Dank!" });
      setData((prev) =>
        prev
          ? { ...prev, instructions: { options: selectedOptions, freetext, updatedAt: new Date().toISOString() } }
          : prev
      );
    } else if (res.status === 409) {
      toast({
        title: "Änderung nicht mehr möglich",
        description: "Die Bestellung ist bereits unterwegs. Bitte kontaktieren Sie den Händler.",
        variant: "destructive",
      });
    } else if (res.status === 401) {
      clearSession(token);
      setSession(null);
      toast({ title: "Sitzung abgelaufen", description: "Bitte erneut mit PLZ verifizieren.", variant: "destructive" });
    } else {
      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
    }
  }

  // PLZ-Gate
  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Sendungsverfolgung</CardTitle>
            <CardDescription>
              Bitte geben Sie zur Verifizierung die Postleitzahl der Lieferadresse ein.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plz">Postleitzahl</Label>
                <Input
                  id="plz"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={plz}
                  onChange={(e) => setPlz(e.target.value)}
                  placeholder="z.B. 45127"
                  maxLength={5}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={verifying}>
                {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sendung anzeigen
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { order, history, editable } = data;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Sendungsverfolgung</h1>
          <p className="text-muted-foreground text-sm">Auftrag {order.auftragsNr}</p>
        </header>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Aktueller Status</CardTitle>
              <CardDescription>von {order.haendlerName}</CardDescription>
            </div>
            <Badge variant={statusVariant(order.status)}>{order.statusLabel}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(order.deliveryAttempts ?? 0) > 0 && order.status !== "zugestellt" && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <p className="font-semibold text-warning">
                  Erneuter Zustellversuch in Planung
                </p>
                <p className="text-muted-foreground mt-1">
                  Versuch {order.deliveryAttempts} von {order.maxDeliveryAttempts ?? 3} war leider nicht erfolgreich.
                  Wir versuchen die Zustellung kostenlos erneut – sobald ein neuer Termin feststeht, informieren wir Sie automatisch.
                </p>
              </div>
            )}
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{order.empfaengerName}</p>
                <p className="text-muted-foreground">
                  {[order.empfaengerAdresse, [order.empfaengerPlz, order.empfaengerStadt].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            </div>
            {order.deliveredAt && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Zugestellt am {formatDateTime(order.deliveredAt)}</span>
                </div>
                {order.delivery && (order.delivery.mode || order.delivery.recipient || order.delivery.note) && (
                  <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-1">
                    {order.delivery.mode && (
                      <p className="text-sm">
                        <span className="font-medium">Übergabe: </span>
                        {formatDeliveryMode(order.delivery.mode)}
                      </p>
                    )}
                    {order.delivery.mode === "nachbar" && order.delivery.recipient && (
                      <p className="text-sm">
                        <span className="font-medium">Nachbar: </span>
                        {order.delivery.recipient}
                      </p>
                    )}
                    {order.delivery.note && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Bemerkung: </span>
                        {order.delivery.note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {(order.status === "unterwegs" || order.status === "in_bearbeitung") && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-start gap-2">
                  <Truck className="h-4 w-4 mt-0.5 text-primary" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {order.status === "unterwegs" ? "Voraussichtliches Lieferzeitfenster" : "Voraussichtliche Zustellung"}
                    </p>
                    <p className="text-base font-medium text-foreground mt-1">
                      {order.eta ? order.eta.window : "Wird Ihnen kurz vor der Zustellung mitgeteilt"}
                    </p>
                    {order.eta && (
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{order.eta.date}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verlauf</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {history.map((entry, idx) => (
                  <li key={idx} className="flex gap-3 text-sm">
                    <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">{entry.statusLabel}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
                      {entry.reason && (
                        <p className="text-xs text-muted-foreground mt-1">Grund: {entry.reason}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lieferanweisungen</CardTitle>
            <CardDescription>
              {editable
                ? order.status === "unterwegs"
                  ? "Bestellung ist unterwegs – Sie können Hinweise noch bis 1 Stunde vor der Zustellung hinterlassen."
                  : "Hinterlassen Sie Hinweise für unseren Fahrer."
                : "Anweisungen können nicht mehr geändert werden, da die Zustellung kurz bevorsteht."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(order.status === "unterwegs" || order.status === "in_bearbeitung") && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-start gap-2">
                  <Truck className="h-4 w-4 mt-0.5 text-primary" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {order.status === "unterwegs" ? "Voraussichtliches Lieferzeitfenster" : "Voraussichtliche Zustellung"}
                    </p>
                    <p className="text-base font-medium text-foreground mt-1">
                      {order.eta ? order.eta.window : "Wird Ihnen kurz vor der Zustellung mitgeteilt"}
                    </p>
                    {order.eta && (
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{order.eta.date}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {INSTRUCTION_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`opt-${opt.value}`}
                    checked={selectedOptions.includes(opt.value)}
                    disabled={!editable || saving}
                    onCheckedChange={(checked) => {
                      setSelectedOptions((prev) =>
                        checked ? Array.from(new Set([...prev, opt.value])) : prev.filter((v) => v !== opt.value)
                      );
                    }}
                  />
                  <Label htmlFor={`opt-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="freetext">Zusätzlicher Hinweis (max. 200 Zeichen)</Label>
              <Textarea
                id="freetext"
                value={freetext}
                onChange={(e) => setFreetext(e.target.value.slice(0, 200))}
                disabled={!editable || saving}
                placeholder="z.B. Klingel defekt — bitte anrufen"
                rows={3}
              />
              <p className="text-xs text-muted-foreground text-right">{freetext.length}/200</p>
            </div>
            {editable && (
              <Button onClick={handleSaveInstructions} disabled={saving} className="w-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Anweisungen speichern
              </Button>
            )}
            {data.instructions.updatedAt && (
              <p className="text-xs text-muted-foreground text-center">
                Zuletzt aktualisiert: {formatDateTime(data.instructions.updatedAt)}
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Wir liefern 100% elektrisch · e-cargo
        </p>
      </div>
    </div>
  );
}
