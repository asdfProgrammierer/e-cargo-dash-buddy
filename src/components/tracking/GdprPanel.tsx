import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, Trash2, ShieldCheck } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface Props {
  session: string;
  auftragsNr: string;
  onDeletionRequested?: () => void;
}

export function GdprPanel({ session, auftragsNr, onDeletionRequested }: Props) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gdpr-customer-export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session}`,
        },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dsgvo-export-${auftragsNr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export bereit", description: "Ihre Daten wurden heruntergeladen." });
    } catch (err) {
      toast({ title: "Export fehlgeschlagen", description: "Bitte später erneut versuchen.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteRequest(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Ungültige E-Mail-Adresse", variant: "destructive" });
      return;
    }
    setRequesting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gdpr-customer-delete-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session}`,
        },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSent(true);
        onDeletionRequested?.();
      } else if (res.status === 401 && data?.error === "email_mismatch") {
        toast({ title: "E-Mail stimmt nicht überein", description: "Die eingegebene Adresse passt nicht zu dieser Bestellung.", variant: "destructive" });
      } else if (res.status === 422) {
        toast({ title: "Keine E-Mail hinterlegt", description: "Zu dieser Bestellung ist keine E-Mail hinterlegt. Bitte wenden Sie sich an support@ecargo-logistik.de.", variant: "destructive" });
      } else if (res.status === 410) {
        toast({ title: "Bereits anonymisiert", description: "Zu dieser Bestellung sind keine personenbezogenen Daten mehr gespeichert.", variant: "destructive" });
      } else if (res.status === 429) {
        toast({ title: "Zu viele Anfragen", description: "Es wurden bereits mehrere Bestätigungslinks angefordert. Bitte prüfen Sie Ihre E-Mails.", variant: "destructive" });
      } else {
        toast({ title: "Anfrage fehlgeschlagen", description: "Bitte später erneut versuchen.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Anfrage fehlgeschlagen", variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  }

  function closeDialog(open: boolean) {
    setDeleteOpen(open);
    if (!open) {
      setSent(false);
      setEmail("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Meine Daten (Datenschutz)
        </CardTitle>
        <CardDescription>
          Nach DSGVO haben Sie das Recht, eine Kopie Ihrer Daten zu erhalten (Art. 15) oder deren Löschung zu verlangen (Art. 17).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" className="w-full justify-start" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Meine Daten herunterladen (JSON)
        </Button>
        <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Meine Daten löschen lassen
        </Button>
      </CardContent>

      <Dialog open={deleteOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Löschung Ihrer Daten anfordern</DialogTitle>
            <DialogDescription>
              Wir senden Ihnen einen Bestätigungslink an die im Auftrag hinterlegte E-Mail-Adresse. Erst nach Klick auf diesen Link werden Ihre Daten anonymisiert.
            </DialogDescription>
          </DialogHeader>

          {sent ? (
            <div className="space-y-3 text-sm">
              <p>Wir haben Ihnen soeben eine E-Mail mit einem Bestätigungslink gesendet. Bitte prüfen Sie auch Ihren Spam-Ordner. Der Link ist 24 Stunden gültig.</p>
              <DialogFooter>
                <Button onClick={() => closeDialog(false)}>Verstanden</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleDeleteRequest} className="space-y-4">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
                <p className="font-semibold">Was gelöscht wird</p>
                <p className="text-muted-foreground">Empfängername, Adresse, E-Mail, Telefon, Notizen sowie Unterschrift/Foto/Lieferschein zu diesem Auftrag.</p>
                <p className="font-semibold mt-2">Was erhalten bleibt</p>
                <p className="text-muted-foreground">Auftragsnummer, PLZ, Status, Paketanzahl, Gewicht und Zeitstempel — für Nachweis- und Statistikzwecke, ohne Personenbezug.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gdpr-email">E-Mail-Adresse aus dieser Bestellung</Label>
                <Input id="gdpr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required maxLength={255} />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="ghost" onClick={() => closeDialog(false)} disabled={requesting}>Abbrechen</Button>
                <Button type="submit" variant="destructive" disabled={requesting}>
                  {requesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Bestätigungslink senden
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}