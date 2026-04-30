import { useCallback, useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, RotateCcw, Save, Send, Sparkles, Beaker } from "lucide-react";

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
  { key: "order-neu", label: "Neu", description: "Neue Bestellung eingegangen." },
  { key: "order-in-bearbeitung", label: "In Bearbeitung", description: "Bestellung wird vorbereitet." },
  { key: "order-unterwegs", label: "Unterwegs", description: "Fahrer ist mit ETA ±30 Min. unterwegs." },
  { key: "order-zugestellt", label: "Zugestellt", description: "Erfolgreich zugestellt (inkl. Bewertung)." },
  { key: "order-nicht-zugestellt", label: "Nicht zugestellt", description: "Zustellung war nicht möglich." },
];

const PLACEHOLDERS = ["{{kundenname}}", "{{haendlerName}}", "{{auftragsNr}}", "{{lieferadresse}}", "{{reason}}", "{{etaWindow}}", "{{etaCenter}}"];

// Fields that map between DB columns and the data-edit-field markers in the rendered HTML.
const EDITABLE_FIELDS: Array<{ marker: string; column: keyof OverrideRow }> = [
  { marker: "preview", column: "preview" },
  { marker: "greeting", column: "greeting" },
  { marker: "intro", column: "intro" },
  { marker: "outro", column: "outro" },
  { marker: "ctaLabel", column: "cta_label" },
  { marker: "footer", column: "footer" },
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
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testEmail, setTestEmail] = useState<string>("");
  const [testOrderNr, setTestOrderNr] = useState<string>("");
  const [testingOrder, setTestingOrder] = useState(false);
  const [dirty, setDirty] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const activeRef = useRef(active);
  activeRef.current = active;

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

  const refreshPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-preview-email", {
        body: { templateName: activeRef.current, overrideDraft: buildOverrideDraft(rowsRef.current[activeRef.current]), editable: true },
      });
      if (error) throw error;
      setPreviewHtml((data as any).html);
    } catch (e: any) {
      toast.error("Vorschau fehlgeschlagen: " + (e?.message ?? e));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Refresh preview when switching template (after initial load)
  useEffect(() => {
    if (!loading) refreshPreview();
  }, [active, loading, refreshPreview]);

  // Wire up inline editing inside the iframe each time the HTML changes.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cancelled = false;
    const wire = () => {
      if (cancelled) return;
      const doc = iframe.contentDocument;
      if (!doc || !doc.body || doc.body.childElementCount === 0) {
        // Not ready yet, retry shortly
        setTimeout(wire, 50);
        return;
      }
      // Avoid double-wiring
      if (doc.documentElement.dataset.wired === "1") return;
      doc.documentElement.dataset.wired = "1";
      // Inject editing styles
      const style = doc.createElement("style");
      style.textContent = `
        [data-edit-field] {
          outline: 1px dashed transparent;
          outline-offset: 2px;
          border-radius: 3px;
          transition: outline-color 120ms, background-color 120ms;
          cursor: text;
        }
        [data-edit-field]:hover { outline-color: #94a3b8; background: rgba(148,163,184,0.08); }
        [data-edit-field]:focus { outline: 2px solid #16a34a; background: rgba(22,163,74,0.06); }
      `;
      doc.head.appendChild(style);

      const fields = doc.querySelectorAll<HTMLElement>("[data-edit-field]");
      if (fields.length === 0) {
        console.warn("[EmailTemplatesPage] Keine [data-edit-field] Marker im HTML gefunden");
      }
      fields.forEach((el) => {
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "true");
        el.addEventListener("input", () => {
          const marker = el.getAttribute("data-edit-field") as string;
          const def = EDITABLE_FIELDS.find((f) => f.marker === marker);
          if (!def) return;
          const value = (el.innerText ?? "").replace(/\u00a0/g, " ");
          const tplKey = activeRef.current;
          setRows((prev) => ({ ...prev, [tplKey]: { ...prev[tplKey], [def.column]: value } }));
          setDirty(true);
        });
        el.addEventListener("paste", (e) => {
          e.preventDefault();
          const text = (e as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
          doc.execCommand("insertText", false, text);
        });
      });
    };
    iframe.addEventListener("load", wire);
    // Try immediately too — srcDoc may already be loaded by the time the effect runs
    wire();
    return () => {
      cancelled = true;
      iframe.removeEventListener("load", wire);
    };
  }, [previewHtml]);

  const updateField = (field: keyof OverrideRow, value: any) => {
    setRows((prev) => ({ ...prev, [active]: { ...prev[active], [field]: value } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const r = rowsRef.current[activeRef.current];
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
      setDirty(false);
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
    setDirty(false);
    toast.success("Auf Standard zurückgesetzt");
    refreshPreview();
  };

  const sendTest = async () => {
    if (!testEmail || !/.+@.+\..+/.test(testEmail)) {
      toast.error("Bitte eine gültige E-Mail-Adresse eingeben");
      return;
    }
    if (dirty) await save();
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

  // Sendet die aktuell gewählte Status-E-Mail mit den echten Daten einer
  // konkreten Bestellung — entweder an die hinterlegte Empfänger-Adresse
  // oder, falls oben eine Test-Adresse eingetragen ist, an diese.
  const sendTestForOrder = async () => {
    const nr = testOrderNr.trim();
    if (!nr) {
      toast.error("Bitte eine Auftragsnummer eingeben (z.B. EC-PMF-0000123)");
      return;
    }
    setTestingOrder(true);
    try {
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .select(
          "id, auftrags_nr, user_id, empfaenger_name, empfaenger_email, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, tracking_token",
        )
        .eq("auftrags_nr", nr)
        .maybeSingle();
      if (oErr) throw oErr;
      if (!order) {
        toast.error("Auftrag nicht gefunden");
        return;
      }
      const recipient = (testEmail || order.empfaenger_email || "").trim();
      if (!recipient) {
        toast.error("Auftrag hat keine Empfänger-E-Mail. Bitte Test-Adresse oben eintragen.");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("firma_name, ansprechpartner")
        .eq("user_id", order.user_id)
        .maybeSingle();
      const haendlerName =
        (prof?.firma_name?.trim() || prof?.ansprechpartner?.trim() || "Ihr Händler");
      const lieferadresse = [
        order.empfaenger_name,
        order.empfaenger_adresse,
        [order.empfaenger_plz, order.empfaenger_stadt].filter(Boolean).join(" "),
      ]
        .filter((x) => x && String(x).trim().length > 0)
        .join(", ");
      const origin = window.location.origin;
      const trackingUrl = order.tracking_token ? `${origin}/track/${order.tracking_token}` : "";

      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: active,
          recipientEmail: recipient,
          idempotencyKey: `manual-test-${active}-${order.id}-${Date.now()}`,
          templateData: {
            kundenname: order.empfaenger_name,
            haendlerName,
            auftragsNr: order.auftrags_nr,
            lieferadresse,
            trackingUrl,
            etaWindow: "14:30 – 15:30 Uhr",
            etaCenter: "15:00",
            reason: "Empfänger nicht angetroffen",
          },
        },
      });
      if (error) toast.error("Versand fehlgeschlagen: " + error.message);
      else toast.success(`Status-E-Mail (${active}) an ${recipient} eingereiht`);
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message ?? e));
    } finally {
      setTestingOrder(false);
    }
  };

  return (
    <AdminLayout title="Einstellungen">
      <SettingsTabs />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Sidebar Vorlagen */}
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Status-Vorlagen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  if (dirty && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
                  setDirty(false);
                  setActive(t.key);
                }}
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

        {/* Live editable preview */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Live bearbeiten: {TEMPLATES.find((t) => t.key === active)?.label}
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="enabled" className="text-xs">Aktiv</Label>
                  <Switch id="enabled" checked={current.enabled} onCheckedChange={(v) => updateField("enabled", v)} />
                </div>
                <Button onClick={save} disabled={saving || loading || !dirty} size="sm">
                  <Save className="mr-2 h-4 w-4" /> {saving ? "Speichere…" : dirty ? "Speichern" : "Gespeichert"}
                </Button>
                <Button variant="outline" size="sm" onClick={resetTemplate}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Zurücksetzen
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div>
                <Label htmlFor="subject" className="text-xs">Betreff</Label>
                <Input
                  id="subject"
                  value={current.subject ?? ""}
                  onChange={(e) => updateField("subject", e.target.value)}
                  placeholder="Standard-Betreff verwenden"
                  className="mt-1"
                />
              </div>
              <div className="flex items-end gap-2">
                <Input
                  type="email"
                  placeholder="Test-Mail an…"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="md:w-[240px]"
                />
                <Button onClick={sendTest} variant="secondary">
                  <Send className="mr-2 h-4 w-4" /> Senden
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Klicken Sie direkt in die Vorschau, um Texte zu bearbeiten. Verfügbare Platzhalter:{" "}
              <span className="font-mono">{PLACEHOLDERS.join(" · ")}</span>
            </p>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Beaker className="h-3.5 w-3.5 text-primary" /> Mit echter Bestellung testen
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Input
                  placeholder="Auftragsnummer (z.B. EC-PMF-0000123)"
                  value={testOrderNr}
                  onChange={(e) => setTestOrderNr(e.target.value)}
                />
                <Button onClick={sendTestForOrder} variant="default" disabled={testingOrder}>
                  <Send className="mr-2 h-4 w-4" />
                  {testingOrder ? "Sende…" : `„${TEMPLATES.find((t) => t.key === active)?.label}" auslösen`}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Sendet die ausgewählte Status-E-Mail mit den echten Daten der Bestellung. Wenn oben eine Test-Adresse eingetragen ist, geht die Mail dorthin — sonst an die im Auftrag hinterlegte Empfänger-Adresse. Die Bestellung selbst wird dabei <strong>nicht</strong> verändert.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border bg-white">
              <iframe
                ref={iframeRef}
                title="E-Mail Live-Vorschau"
                srcDoc={previewHtml}
                className="h-[720px] w-full"
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
