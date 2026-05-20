## Ziel
Sendungsverfolgung komplett im Modal auf `bochum-bringts.html` abwickeln – keine Weiterleitung zu `ecargo-connect.ecargo-logistik.de/track/<token>` mehr.

## Aktueller Flow
1. Modal: Eingabe Auftragsnummer → `public-tracking-lookup` → liefert `{ url }` → `window.location.href` redirect.
2. Auf `/track/<token>` PLZ eingeben → `verify-tracking-access` → Session-JWT → `tracking-data` lädt Status/History/ETA.

## Neuer Flow (Modal-only)
Zwei Schritte **innerhalb desselben Modals**:

**Schritt 1 – Auftragsnummer**
- Eingabe `EC-XXX-0000000` → POST `public-tracking-lookup`
- Edge Function liefert künftig zusätzlich zum `url` auch den `tracking_token` (oder nur Token, URL kann entfallen).

**Schritt 2 – PLZ-Verifizierung (im selben Modal eingeblendet)**
- Eingabe 5-stellige PLZ → POST `verify-tracking-access` mit `{ token, plz }` → erhält `session` JWT.

**Schritt 3 – Tracking-Ansicht (im Modal gerendert)**
- GET `tracking-data` mit `Authorization: Bearer <session>` → rendert kompakte Statusanzeige:
  - Status-Badge + Label
  - Auftragsnummer, Empfänger-Stadt
  - ETA-Fenster (falls vorhanden)
  - Timeline (History)
  - Bei „zugestellt": Übergabe-Details
- Optional: Link „Vollständige Ansicht öffnen" → `ecargo-connect.../track/<token>` (für Lieferanweisungen bearbeiten etc.)

## Technische Änderungen

### Edge Function `public-tracking-lookup`
- Response erweitern: `{ token: string, url: string }` (URL für Abwärtskompatibilität behalten).
- CORS unverändert (nur `ecargo-logistik.de` Origins).

### Edge Function `verify-tracking-access`
- CORS-Allowlist um `https://ecargo-logistik.de` + `www.` erweitern (aktuell `*` – ok, aber besser einschränken).
- Keine Logikänderung nötig.

### Edge Function `tracking-data`
- CORS-Allowlist analog einschränken auf `ecargo-logistik.de` + App-Origin.
- Keine Logikänderung.

### `bochum-bringts.html` + `js/tracking.js`
- Modal-Markup erweitern: drei Sektionen (`#trackingStep1`, `#trackingStep2`, `#trackingResult`), je nach Zustand sichtbar.
- `tracking.js` State-Machine:
  - `step1 submit` → `lookup` → speichert `token` → zeigt step2
  - `step2 submit` → `verify` → speichert `session` → ruft `data` → rendert Result
  - „Neue Suche" Button → reset
- Rendering der Timeline + Status rein clientseitig (HTML-String, mit den semantischen Klassen der Landing Page).
- Fehlerbehandlung pro Schritt (404, 401 „invalid_credentials", 429, Netz).

## Snippet-Lieferung
Da `bochum-bringts.html` außerhalb des Lovable-Repos liegt, werden geliefert:
1. Patch für `public-tracking-lookup/index.ts` (Token in Response).
2. CORS-Patches für `verify-tracking-access` und `tracking-data`.
3. Komplettes neues Modal-HTML.
4. Komplette neue `js/tracking.js`.
5. Zusätzliches CSS für die drei Modal-Steps + Timeline.

## Offene Frage
Soll im Modal-Result die **Option zur Bearbeitung der Lieferanweisungen** enthalten sein, oder reicht ein „Mehr Details / Lieferanweisungen ändern"-Link auf die App-Seite? (Lieferanweisungen brauchen mehr UI: Checkboxen, Freitext, PATCH-Call – das bläht das Modal auf.)
