import { Shield, Lock, Database, Mail, Trash2, Users, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { PageHead } from "@/components/PageHead";

const TrustPage = () => {
  return (
    <>
    <PageHead title="Sicherheit & Datenschutz – e-cargo" description="Informationen zu Sicherheit, Datenschutz und DSGVO-Konformität der e-cargo Kurierlogistik-Plattform im Ruhrgebiet." path="/sicherheit" />
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            Sicherheit & Datenschutz
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Vertrauen & Datenschutz bei e-cargo</h1>
          <p className="text-muted-foreground">
            Diese Seite wird von e-cargo Logistik gepflegt und beantwortet die häufigsten Fragen
            zu Sicherheit, Datenschutz und Datenverarbeitung in der e-cargo Plattform.
            Sie ist keine unabhängige Zertifizierung.
          </p>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Zugriff & Authentifizierung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Anmeldung über E-Mail/Passwort. Fahrer melden sich mit Username + PIN an.</p>
              <p>Rollen (Admin, Händler, Fahrer) werden serverseitig in einer separaten Tabelle geprüft.</p>
              <p>Zugriff auf Bestell-, Adress- und Fahrerdaten ist durch zeilenbasierte Sicherheitsregeln (RLS) eingeschränkt.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Plattform & Hosting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Die Plattform läuft auf der Lovable Cloud (Supabase-Infrastruktur in der EU).</p>
              <p>Verbindungen erfolgen ausschließlich über TLS. Sensible Drittanbieter-Schlüssel
                (z. B. DHL- oder Shop-API-Keys) liegen serverseitig in Secrets und sind im Frontend nicht abrufbar.</p>
              <p>e-cargo trägt Verantwortung für die App-Konfiguration; die zugrundeliegende Infrastrukturhärtung liegt bei Lovable/Supabase.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Erhobene Daten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Für die Auftragsabwicklung verarbeiten wir Kontaktdaten von Händlern und Empfängern,
                Lieferadressen, Sendungsstatus, Fotos/Unterschriften zur Zustellbestätigung
                sowie Fahrer-Standorte während aktiver Touren.</p>
              <p>Die Daten werden ausschließlich zur Erbringung der Logistikleistung und zur Kommunikation
                mit den Beteiligten genutzt.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Integrationen & Subdienstleister</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Genutzte technische Dienste: Lovable/Supabase (Hosting, Datenbank, Auth, Storage),
                DHL Parcel DE (Versand außerhalb des Liefergebiets) und Shop-APIs (z. B. Shopify) für
                den Auftragsimport.</p>
              <p>Daten werden nur an diese Dienste übermittelt, soweit es für den jeweiligen Auftrag erforderlich ist.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Trash2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Aufbewahrung & Löschung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Zustellbelege (Fotos, Unterschriften) und Status-Historie werden im Rahmen der DSGVO
                automatisch nach 2 Monaten gelöscht (täglicher Cron).</p>
              <p>E-Mail-Sende-Logs werden nach 90 Tagen, Unsubscribe-Token nach 30 Tagen entfernt.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Sicherheitskontakt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Sicherheitsmeldungen, Datenschutzanfragen oder Hinweise auf Schwachstellen bitte an
                den e-cargo Betreiber richten. Der konkrete Ansprechpartner kann auf Anfrage von e-cargo
                ergänzt werden.</p>
            </CardContent>
          </Card>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Diese Seite beschreibt aktivierte Funktionen und aktuelle Praktiken. Sie stellt keine
          Zusicherung von Zertifizierungen (z. B. ISO 27001, SOC 2) dar. Verantwortlich für den Inhalt
          ist der Betreiber von e-cargo.
        </p>
      </div>
    </div>
    </>
  );
};

export default TrustPage;