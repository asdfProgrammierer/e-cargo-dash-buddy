import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, RotateCcw, Save, Send, Eye } from "lucide-react";

type TemplateKey =
  | "order-neu"
  | "order-in-bearbeitung"
  | "order-unterwegs"
  | "order-zugestellt"
  | "order-nicht-zugestellt";

interface OverrideRow {
  template_name: TemplateKey;
  subject: string | null;
  preview: string | null;
  greeting: string | null;
  intro: string | null;
  outro: string | null;
  cta_label: string | null;
  footer: string | null;
  enabled: boolean;
}

const TEMPLATES: { key: TemplateKey; label: string; description: string }[] = [
  { key: "order-neu", label: "Neu", description: "Wird gesendet, wenn eine neue Bestellung eingeht." },
  { key: "order-in-bearbeitung", label: "In Bearbeitung", description: "Wird gesendet, wenn die Bestellung vorbereitet wird." },
  { key: "order-unterwegs", label: "Unterwegs", description: "Wird gesendet, sobald der Fahrer startet (mit ETA ±30 Min.)." },
  { key: "order-zugestellt", label: "Zugestellt", description: "Wird nach erfolgreicher Zustellung gesendet (inkl. Bewertung)." },
  { key: "order-nicht-zugestellt", label: "Nicht zugestellt", description: "Wird gesendet, wenn die Zustellung nicht möglich war." },
];

const PLACEHOLDERS = ["{{kundenname}}", "{{haendlerName}}", "{{auftragsNr}}", "{{lieferadresse}}", "{{reason}}", "{{etaWindow}}", "{{etaCenter}}"];

const FIELD_DEFS: Array<{
  key: keyof Omit<OverrideRow, "template_name" | "enabled">;
  label: string;
  type: "input" | "textarea";
  hint?: string;
}> = [
  { key: "subject", label: "Betreff", type: "input", hint: "Wird in der Inbox angezeigt." },
  { key: "preview", label: "Vorschau-Text", type: "input", hint: "Erscheint neben dem Betreff im Posteingang." },
  { key: "greeting", label: "Anrede", type: "input", hint: "z. B. „Guten Tag {{kundenname}},“" },
  { key: "intro", label: "Haupttext", type: "textarea" },
  { key: "outro", label: "Schlussabsatz", type: "textarea" },
  { key: "cta_label", label: "Button-Text", type: "input" },
  { key: "footer", label: "Fußzeile", type: "input" },
];

const emptyOverride = (k: TemplateKey): OverrideRow => ({
  template_name: k, subject: "", preview: "", greeting: "", intro: "", outro: "", cta_label: "", footer: "", enabled: true,
});

const EmailTemplatesPage = () => {
  const [active, setActive] = useState<TemplateKey>("order-neu");
  const [rows, setRows] = useState<Record<TemplateKey, OverrideRow>>(() => ({
    "order-neu": emptyOverride("order-neu"),
    "order-in-bearbeitung": emptyOverride("order-in-bearbeitung"),
    "order-unterwegs": emptyOverride("order-unterwegs"),
    "order-zugestellt": emptyOverride("order-zugestellt"),
    "order-nicht-zugestellt": emptyOverride("order-nicht-zugestellt"),
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testEmail, setTestEmail] = useState<string>("");

  const current = rows[active];

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("email_template_overrides")
        .select("template_name, subject, preview, greeting, intro, outro, cta_label, footer, enabled");
      if (error) toast.error("Vorlagen konnten nicht geladen werden");
      else if (data) {
        setRows((prev) => {
          const next = { ...prev };
          for (const r of data as any[]) {
            if (r.template_name in next) {
              next[r.template_name as TemplateKey] = {
                template_name: r.template_name,
                subject: r.subject ?? "",
                preview: r.preview ?? "",
                greeting: r.greeting ?? "",
                intro: r.intro ?? "",
                outro: r.outro ?? "",
                cta_label: r.cta_label ?? "",
                footer: r.footer ?? "",
                enabled: r.enabled !== false,
              };
            }
          }
          return next;
        });
      }
      setLoading(false);
    })();
  }, []);

  const buildOverrideDraft = (r: OverrideRow) => ({
    subject: r.subject || null,
    preview: r.preview || null,
    greeting: r.greeting || null,
    intro: r.intro || null,
    outro: r.outro || null,
    ctaLabel: r.cta_label || null,
    footer: r.footer || null,
    enabled: r.enabled,
  });

  const refreshPreview = async () => {
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-preview-email", {
        body: { templateName: active, overrideDraft: buildOverrideDraft(current) },
      });
      if (error) throw error;
      setPreviewHtml((data as any).html);
      setPreviewSubject((data as any).subject);
    } catch (e: any) {
      toast.error("Vorschau fehlgeschlagen: " + (e?.message ?? e));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Auto-refresh preview when switching template
  useEffect(() => {
    if (!loading) refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loading]);

  const update = (field: keyof OverrideRow, value: any) => {
    setRows((prev) => ({ ...prev, [active]: { ...prev[active], [field]: value } }));
  };

  const save = async () => {
    setSaving(true);
    const r = rows[active];
    const payload = {
      template_name: r.template_name,
      subject: r.subject || null,
      preview: r.preview || null,
      greeting: r.greeting || null,
      intro: r.intro || null,
      outro: r.outro || null,
      cta_label: r.cta_label || null,
      footer: r.footer || null,
      enabled: r.enabled,
    };
    const { error } = await supabase
      .from("email_template_overrides")
      .upsert(payload, { onConflict: "template_name" });
    setSaving(false);
    if (error) toast.error("Speichern fehlgeschlagen: " + error.message);
    else {
      toast.success("Vorlage gespeichert");
      refreshPreview();
    }
  };

  const resetTemplate = async () => {
    if (!confirm("Diese Vorlage wirklich auf den Standard zurücksetzen?")) return;
    const { error } = await supabase
      .from("email_template_overrides")
      .delete()
      .eq("template_name", active);
    if (error) {
      toast.error("Zurücksetzen fehlgeschlagen");
      return;
    }
    setRows((prev) => ({ ...prev, [active]: emptyOverride(active) }));
    toast.success("Auf Standard zurückgesetzt");
    refreshPreview();
  };

  const sendTest = async () => {
    if (!testEmail || !/.+@.+\..+/.test(testEmail)) {
      toast.error("Bitte eine gültige E-Mail-Adresse eingeben");
      return;
    }
    // Save first to ensure preview matches what is sent
    await save();
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: active,
        recipientEmail: testEmail,
        idempotencyKey: `test-${active}-${Date.now()}`,
        templateData: {
          kundenname: "Max Mustermann",
          haendlerName: "PMF Store",
          auftragsNr: "EC-PMF-0000123",
          lieferadresse: "Musterstraße 1, 12345 Berlin",
          etaWindow: "14:30 – 15:30 Uhr",
          etaCenter: "15:00",
          reason: "Empfänger nicht angetroffen",
        },
      },
    });
    if (error) toast.error("Test-Mail fehlgeschlagen: " + error.message);
    else toast.success(`Test-Mail an ${testEmail} eingereiht`);
  };

  const placeholderHint = useMemo(
    () => PLACEHOLDERS.join("  ·  "),
    [],
  );

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_1fr]">
        {/* Sidebar Vorlagen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Status-Vorlagen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  active === t.key
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <div>{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Bearbeiten: {TEMPLATES.find((t) => t.key === active)?.label}</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="enabled" className="text-xs">Aktiv</Label>
              <Switch
                id="enabled"
                checked={current.enabled}
                onCheckedChange={(v) => update("enabled", v)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Verfügbare Platzhalter: <span className="font-mono">{placeholderHint}</span>
            </p>
            {FIELD_DEFS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={f.key}>{f.label}</Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.key}
                    rows={4}
                    value={(current[f.key] as string) ?? ""}
                    onChange={(e) => update(f.key, e.target.value)}
                    disabled={loading}
                    className="mt-1"
                  />
                ) : (
                  <Input
                    id={f.key}
                    value={(current[f.key] as string) ?? ""}
                    onChange={(e) => update(f.key, e.target.value)}
                    disabled={loading}
                    className="mt-1"
                  />
                )}
                {f.hint ? <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p> : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={save} disabled={saving || loading}>
                <Save className="mr-2 h-4 w-4" /> {saving ? "Speichere…" : "Speichern"}
              </Button>
              <Button variant="outline" onClick={refreshPreview} disabled={previewLoading}>
                <Eye className="mr-2 h-4 w-4" /> Vorschau aktualisieren
              </Button>
              <Button variant="outline" onClick={resetTemplate}>
                <RotateCcw className="mr-2 h-4 w-4" /> Auf Standard zurücksetzen
              </Button>
            </div>
            <div className="border-t pt-4">
              <Label htmlFor="test-email">Test-Mail senden an</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="test-email"
                  type="email"
                  placeholder="name@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <Button onClick={sendTest} variant="secondary">
                  <Send className="mr-2 h-4 w-4" /> Senden
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Speichert die Vorlage und sendet eine Beispiel-Mail mit Beispieldaten.</p>
            </div>
          </CardContent>
        </Card>

        {/* Vorschau */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live-Vorschau</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 rounded-md bg-muted px-3 py-2 text-xs">
              <span className="font-semibold">Betreff:</span> {previewSubject || <span className="text-muted-foreground">—</span>}
            </div>
            <div className="overflow-hidden rounded-md border bg-white">
              <iframe
                title="E-Mail-Vorschau"
                srcDoc={previewHtml}
                className="h-[640px] w-full"
                sandbox=""
              />
            </div>
            {previewLoading ? <p className="mt-2 text-xs text-muted-foreground">Lade Vorschau…</p> : null}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default EmailTemplatesPage;