
# Fahrer-App (Phase 1) – Plan

## Ziel
Eine separate, mobil-optimierte Oberfläche für Fahrer, ausgeliefert als **echte native Android-App via Capacitor**. Fahrer melden sich mit **Username + PIN** an und sehen ihre für heute (und kommende Tage) zugewiesenen Routen mit allen Stopps.

---

## 1. Login-Konzept (Username + PIN)

Supabase Auth benötigt intern eine E-Mail. Wir verstecken das vor dem Fahrer:

- Admin legt im **Fahrer-Bereich** zusätzliche Felder an: `Username` (z.B. `max.mueller`) und `PIN` (4–6 Ziffern, beim Anlegen/Reset einmalig sichtbar).
- Im Hintergrund wird ein Supabase-Auth-User mit Pseudo-E-Mail `<username>@drivers.e-cargo.local` und dem PIN als Passwort erstellt.
- Der Fahrer-User bekommt die neue Rolle `driver` (in `user_roles`).
- Im Login-Screen der Fahrer-App gibt es nur zwei Felder: **Username** und **PIN**. Die App setzt intern die Pseudo-E-Mail zusammen und ruft `signInWithPassword` auf.
- Admin kann jederzeit **PIN zurücksetzen** (neuer PIN wird einmalig angezeigt) und den Fahrer **deaktivieren** (Auth-User wird gesperrt + `drivers.status = inaktiv`).

Sicherheitshinweise:
- PIN wird nirgends im Klartext gespeichert (nur Supabase-Auth-Hash).
- Bruteforce-Schutz: nach z.B. 5 Fehlversuchen 60s Sperre (clientseitig + serverseitige Rate-Limit-Funktion in einer Edge Function).

---

## 2. Datenmodell-Änderungen

**`drivers` Tabelle erweitern:**
- `username` (text, unique, lowercase, regex `^[a-z0-9._-]{3,32}$`)
- `auth_user_id` (uuid, nullable) – Verknüpfung zum Supabase-Auth-User
- `last_login_at` (timestamptz, nullable)

**Neue Rolle in `app_role` Enum:** `driver`

**RLS-Anpassungen:**
- `routes`: neue Policy „Driver kann eigene Routen sehen" → `driver_id` über `drivers.auth_user_id = auth.uid()`
- `route_stops`: neue Policy „Driver kann Stopps eigener Routen sehen + Status updaten"
- `orders`: read-only Policy für verknüpfte Orders der eigenen Route
- `depots`: read-only für Driver (nur Start/Ziel der eigenen Routen)
- Helper-Function `is_route_driver(_route_id uuid)` (security definer)

---

## 3. Edge Functions

- **`driver-create-credentials`** (admin only): legt Auth-User an, setzt initialen PIN, schreibt `auth_user_id` in `drivers`.
- **`driver-reset-pin`** (admin only): generiert neuen 6-stelligen PIN, updated Passwort, gibt PIN einmalig zurück.
- **`driver-update-stop-status`** (driver only): markiert Stopp als `erledigt` / `uebersprungen` (mit Grund), aktualisiert die zugehörige Order auf `zugestellt` / `nicht_zugestellt`, triggert die bestehenden Email-Templates.
- Rate-Limit-Wrapper für Login-Versuche (optional Phase 1.5).

---

## 4. UI – Admin-Seite (Erweiterung `/admin/fahrer`)

Im Fahrer-Dialog zusätzlich:
- Feld **Username** (Pflicht für Login-Aktivierung)
- Button **„Login aktivieren"** → erzeugt Credentials, zeigt PIN einmalig in modalem Dialog mit „Kopieren"
- Button **„PIN zurücksetzen"** → neuer PIN, einmalig anzeigen
- Statusanzeige: „Login aktiv" / „Kein Login" + `last_login_at`

---

## 5. UI – Fahrer-App (neue Routen `/fahrer/*`)

Eigenes, mobile-first Layout (kein AdminSidebar):

- **`/fahrer/login`** – Username + PIN (Numpad-Tastatur), Logo, „Eingeloggt bleiben"
- **`/fahrer`** – Heutige Route(n) als große Karten: Routenname, Datum, Startzeit, Anzahl Stopps, Fortschrittsbalken (x/y erledigt). Tab/Switch für „Heute" / „Kommende"
- **`/fahrer/route/:id`** – Stopp-Liste in optimierter Reihenfolge:
  - Pro Stopp: Position, Name, Adresse, Telefon (klickbar `tel:`), ETA, Paketanzahl, Notiz
  - Status-Badge (offen / erledigt / nicht zugestellt)
  - Buttons: **„Navigieren"** (Deep-Link `geo:lat,lng?q=adresse` → Android wählt Maps-App), **„Zugestellt"**, **„Nicht zugestellt"** (öffnet Sheet mit Grund-Auswahl)
  - Sticky Footer: Fortschritt + „Route abschließen" wenn alle erledigt
- **`/fahrer/profil`** – Name, Logout, App-Version

Zugriffsschutz: `DriverRoute`-Wrapper analog zu `AdminRoute`, prüft `driver`-Rolle.

---

## 6. Native App via Capacitor

```text
[Web-Build /fahrer/*] → [Capacitor wrap] → [Android Studio] → [APK/AAB]
                                                                  ↓
                                                       Verteilung an Fahrer
                                                       (Direktinstall oder Play Store)
```

Schritte:
1. Capacitor + Plugins installieren (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/app`, `@capacitor/preferences` für Session-Persistenz).
2. `capacitor.config.ts` mit `appId: app.lovable.eb7a8883e02647dc82bb300906e3fa89`, `appName: e-cargo-driver`.
3. App-Icon & Splash-Screen mit e-cargo-Branding (Sage/Emerald + Leaf-Logo).
4. `main.tsx`: Wenn auf Capacitor (`Capacitor.isNativePlatform()`) → direkt zu `/fahrer/login` redirecten, Admin-Routen sind in der Android-App nicht erreichbar.
5. Anleitung für dich: GitHub-Export → `npm install` → `npx cap add android` → `npm run build` → `npx cap sync` → `npx cap open android` → in Android Studio APK bauen.

Hinweis: Eine echte App-Datei (.apk) wird **nicht** in Lovable selbst erzeugt – das passiert lokal in Android Studio (kostenlos). Der Build-Prozess wird einmalig eingerichtet, danach reicht jeweils `git pull && npm run build && npx cap sync` für Updates.

---

## 7. Reihenfolge der Umsetzung (in dieser PR)

1. DB-Migration: `drivers` erweitern, `app_role` um `driver`, RLS-Policies, Helper-Function.
2. Edge Functions: `driver-create-credentials`, `driver-reset-pin`, `driver-update-stop-status`.
3. Admin-UI: `/admin/fahrer` um Username/PIN-Verwaltung erweitern.
4. Fahrer-UI: Layout, `/fahrer/login`, `/fahrer`, `/fahrer/route/:id`, `/fahrer/profil`.
5. Routing & Guards (`DriverRoute`, Capacitor-Redirect).
6. Capacitor-Setup + Branding + Anleitung.

---

## Was später (Phase 2) sinnvoll wäre
- Push-Notifications bei neuer Route (FCM via Capacitor)
- Foto-Upload als Zustellnachweis
- Unterschrift auf dem Display
- Offline-Modus (Service Worker / Capacitor Storage)
- iOS-Build (gleicher Capacitor-Code, nur `npx cap add ios`)
