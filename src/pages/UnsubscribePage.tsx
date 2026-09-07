import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MailX } from "lucide-react";

export default function UnsubscribePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <MailX className="h-5 w-5" /> E-Mail-Benachrichtigungen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Die Abmeldung von E-Mails erfolgt direkt über den Link{" "}
            <strong>„Von E-Mails abmelden“</strong> am Ende jeder E-Mail, die Sie
            von e-cargo erhalten.
          </p>
          <p className="text-sm text-muted-foreground">
            Nach der Abmeldung erhalten Sie keine weiteren Benachrichtigungs-E-Mails
            von uns. E-Mails zu Ihrem Konto (z.&nbsp;B. Passwort-Zurücksetzen) sind
            davon nicht betroffen.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
