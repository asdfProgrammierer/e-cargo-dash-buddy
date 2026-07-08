## Ziel

Endkunden (Zustellempfänger ohne Login) sollen ihre DSGVO-Rechte selbst wahrnehmen können:
- **Art. 15** — Auskunft: eigene Daten als JSON/PDF-Download.
- **Art. 17** — Löschung: sofortige Anonymisierung ihres Auftrags (statt der 2-Monats-Automatik).

Basis ist der bereits existierende Tracking-Flow (`tracking_token` + PLZ → signierte Session). Der Session-Nachweis reicht aber allein nicht für Löschung — bei irreversiblen Aktionen setzen wir zusätzlich einen **E-Mail-Bestätigungslink** ein (Double-Opt-In). Damit ist der Empfänger als Berechtigter verifiziert (Art. 12 Abs. 6 DSGVO — angemessene Identitätsprüfung).

## Ablauf für den Endkunden

### Einstiegspunkt
Auf der bestehenden Tracking-Seite (`/tracking?token=…`) erscheint nach erfolgreichem PLZ-Login unten ein Bereich **„Datenschutz / Meine Daten"** mit zwei Buttons:
- „Meine Daten herunterladen" (Art. 15)
- „Meine Daten löschen" (Art. 17)

### Art. 15 — Auskunft (in einem Schritt)
1. Klick → Edge Function `gdpr-customer-export` prüft die Tracking-Session.
2. Antwort ist ein JSON-Download mit allen Feldern zu diesem einen Auftrag: Auftragsnummer, Status/-verlauf, Adresse/Kontaktdaten, Paketdaten, Zustellversuche, Zustelldatum, Nachweise (Unterschrift/Foto/Lieferschein als signierte, zeitlich begrenzte Download-Links).
3. Ein Audit-Log-Eintrag `gdpr_customer_export` wird geschrieben (Order-ID, Zeitstempel, IP-Hash).

Keine E-Mail-Bestätigung nötig, da nur Daten zum aktuell schon durch Token+PLZ freigeschalteten Auftrag ausgeliefert werden — das gleiche Vertrauensniveau, das der Kunde bereits hat, um Sendungsstatus/Adresse/Nachweise zu sehen.

### Art. 17 — Löschung (Double-Opt-In per E-Mail)
1. Klick auf „Meine Daten löschen" öffnet ein Modal mit Warnhinweis (unwiderruflich, betrifft nur diesen einen Auftrag, Rechnungs-/Steuerpflichten des Händlers bleiben davon unberührt).
2. Feld: E-Mail-Adresse eingeben (muss mit `orders.empfaenger_email` übereinstimmen). Falls im Auftrag keine E-Mail hinterlegt ist, Fallback-Hinweis: „Bitte wenden Sie sich an support@ecargo-logistik.de" — dann geht's per Ticket, nicht self-service.
3. Edge Function `gdpr-customer-delete-request` (verify_jwt=false, prüft Tracking-Session + Case-insensitive E-Mail-Match) erzeugt einen Einmal-Token (32 Byte hex, 24 h gültig, single-use) in neuer Tabelle `gdpr_deletion_tokens (id, order_id, token_hash, requested_email, expires_at, used_at, created_at)` und schickt eine Bestätigungsmail an genau die im Auftrag hinterlegte Adresse.
4. Bestätigungsmail: „Klicken Sie hier, um die Löschung Ihrer Daten zu Auftrag `EC-XXX-…` zu bestätigen." Link → `/gdpr/confirm-delete?token=…`.
5. Diese Seite ruft `gdpr-customer-delete-confirm` auf. Der Token wird per Hash verglichen, als `used_at` markiert und die Order sofort mit derselben Anonymisierungslogik wie der 2-Monats-Job behandelt (Felder auf NULL / `'anonymisiert'`, `anonymized_at = now()`, Storage-Objekte gelöscht, Status-Historie zu diesem Auftrag entfernt). Audit-Eintrag `gdpr_customer_deleted`.
6. Erfolgsseite: „Ihre Daten wurden anonymisiert." Der Tracking-Token wird ebenfalls geleert, weiterer Zugriff ist nicht mehr möglich.

## Was NICHT gelöscht wird (Rechtfertigung Art. 17 Abs. 3 lit. b/e DSGVO)

- Auftragsnummer, Händler-Zuordnung, PLZ, Status, Paketanzahl, Gewicht, Zustellversuche, Zeitstempel (Nachweispflicht des Händlers gegenüber seinem Auftraggeber; berechtigtes Interesse an Betriebs-/Abrechnungsstatistiken; PLZ ist ohne weitere Merkmale nicht personenbeziehbar).
- `admin_audit_log`-Einträge (Nachweis der Rechtmäßigkeit der Verarbeitung, 12 Monate Retention greift separat).

Diese Einschränkung wird dem Kunden im Löschmodal transparent kommuniziert.

## Technische Umsetzung

### Datenbank
Migration:
- Tabelle `public.gdpr_deletion_tokens` (id uuid PK, order_id uuid FK → orders, token_hash text unique, requested_email citext, expires_at timestamptz, used_at timestamptz null, created_at timestamptz default now()). GRANT nur service_role. RLS enabled, keine Policies (nur SECURITY-DEFINER-Zugriff via Edge Function mit Service-Role).
- Cleanup: `gdpr_cleanup_personal_data()` erweitern → abgelaufene/verbrauchte Tokens > 30 Tage löschen.

### Edge Functions (drei neue, alle `verify_jwt = false`, alle validieren Tracking-Session per `verifyTrackingSession`)
1. **`gdpr-customer-export`** — POST { session } → JSON-Download. Nutzt Service-Role für DB + signierte Storage-URLs (5 min).
2. **`gdpr-customer-delete-request`** — POST { session, email } → generiert Token, speichert Hash, enqueued Bestätigungsmail über bestehendes `enqueue_email` → `transactional_emails`-Queue. Rate-Limit: max. 3 offene Tokens pro Order.
3. **`gdpr-customer-delete-confirm`** — POST { token } → validiert (nicht abgelaufen, nicht verbraucht), führt Anonymisierung + Storage-Cleanup identisch zur `gdpr_cleanup_personal_data`-Logik aus, schreibt Audit-Log. Kein Session-Check nötig (Token IST der Nachweis).

### E-Mail-Template
Neues transaktionales Template `gdpr-delete-confirm.tsx` in `supabase/functions/_shared/transactional-email-templates/` und Registrierung in `registry.ts`. Ein Betreff wie „Bestätigen Sie die Löschung Ihrer Daten (Auftrag EC-…)". Deploy von `process-email-queue` + `send-transactional-email` nach dem Anlegen.

### Frontend
- `src/pages/TrackingPage.tsx`: neue Sektion „Datenschutz" mit den beiden Buttons (nur sichtbar wenn Session aktiv).
- Neue Komponente `GdprPanel.tsx` mit Modalen (Export-Bestätigung, Lösch-Warnung + E-Mail-Feld + „Bestätigungslink senden").
- Neue Route + Seite `src/pages/GdprConfirmDeletePage.tsx` für den Link aus der Mail. Öffentlich, ohne Auth.
- Kein Login-Zwang, keine Merchant-Views verändert.

### Sichtbarkeit im Admin
- Admin sieht im Audit-Log die Aktionen `gdpr_customer_export` und `gdpr_customer_deleted` inkl. Auftragsnummer. Keine separate UI nötig — nutzt vorhandene Audit-Log-Anzeige.

## Nicht Teil dieses Plans

- Widerspruchsrecht (Art. 21), Datenübertragbarkeit (Art. 20 → identisch zum Export, JSON gilt als portables Format), Berichtigung (Art. 16 — Adressänderung erfordert Händler-Workflow, hier zu risikoreich für self-service).
- Löschung über E-Mail-Adresse ohne Tracking-Token (würde Enumeration/Massen-Missbrauch ermöglichen). Statt dessen Ticket-Fallback über Support-Mail.
- Änderungen an Merchant-Aufbewahrungsfristen.

## Rechtlicher Hinweis

Keine Rechtsberatung. Die konkrete Ausgestaltung (E-Mail-Bestätigung als angemessene Identitätsprüfung, welche Felder unter berechtigtem Interesse behalten werden dürfen, Frist zur Beantwortung 30 Tage) sollte der Datenschutzbeauftragte / Fachanwalt final absegnen. Insbesondere die Formulierung im Lösch-Modal und der Datenschutzhinweis „was nicht gelöscht wird und warum" gehören juristisch geprüft.
