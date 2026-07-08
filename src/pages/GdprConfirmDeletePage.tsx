import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/PageHead";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State =
  | { kind: "loading" }
  | { kind: "success"; auftragsNr?: string }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "used" }
  | { kind: "error" };

export default function GdprConfirmDeletePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setState({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/gdpr-customer-delete-confirm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setState({ kind: "success", auftragsNr: data?.auftragsNr });
        else if (res.status === 410 && data?.error === "already_used") setState({ kind: "used" });
        else if (res.status === 410 && data?.error === "expired") setState({ kind: "expired" });
        else if (res.status === 404 || res.status === 400) setState({ kind: "invalid" });
        else setState({ kind: "error" });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <PageHead title="Datenlöschung bestätigen – e-cargo" description="Bestätigen Sie die Löschung Ihrer personenbezogenen Daten bei e-cargo." path="/gdpr/confirm-delete" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Datenlöschung</CardTitle>
          <CardDescription>DSGVO Art. 17 – Recht auf Vergessenwerden</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Löschung wird durchgeführt…</div>
          )}
          {state.kind === "success" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-success"><CheckCircle2 className="h-5 w-5" /><span className="font-medium">Ihre Daten wurden anonymisiert.</span></div>
              {state.auftragsNr && <p className="text-muted-foreground">Auftrag {state.auftragsNr}</p>}
              <p className="text-muted-foreground">Die Sendungsverfolgung für diesen Auftrag ist ab sofort nicht mehr aufrufbar. Es sind keine weiteren Schritte notwendig.</p>
            </div>
          )}
          {state.kind === "used" && (
            <div className="flex items-start gap-2 text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-success" /><span>Dieser Bestätigungslink wurde bereits verwendet. Ihre Daten sind bereits anonymisiert.</span></div>
          )}
          {state.kind === "expired" && (
            <div className="flex items-start gap-2 text-destructive"><AlertCircle className="h-5 w-5" /><span>Der Bestätigungslink ist abgelaufen. Bitte fordern Sie über die Sendungsverfolgung einen neuen Link an.</span></div>
          )}
          {state.kind === "invalid" && (
            <div className="flex items-start gap-2 text-destructive"><AlertCircle className="h-5 w-5" /><span>Der Bestätigungslink ist ungültig.</span></div>
          )}
          {state.kind === "error" && (
            <div className="flex items-start gap-2 text-destructive"><AlertCircle className="h-5 w-5" /><span>Die Löschung ist fehlgeschlagen. Bitte später erneut versuchen oder support@ecargo-logistik.de kontaktieren.</span></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}