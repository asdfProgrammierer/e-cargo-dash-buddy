# Capacitor: Dev- und Production-Build sauber trennen

Ziel: Eine APK, die wirklich offline/standalone läuft (Production), und parallel weiterhin die Möglichkeit, per Hot-Reload direkt aus der Lovable-Sandbox zu entwickeln (Dev).

## Problem heute
`capacitor.config.ts` enthält fest einen `server.url` auf die Lovable-Preview. Dadurch lädt **jede** APK den Code live aus der Sandbox – nicht für Endnutzer geeignet und nicht offline-fähig.

## Lösung: Zwei Konfigurationen über eine Umgebungsvariable
Eine einzige `capacitor.config.ts`, die abhängig von `CAP_ENV` entweder den Dev-Server einbindet oder rein lokal aus `dist/` läuft.

```text
CAP_ENV=dev   -> server.url = Lovable Preview (Hot Reload)
CAP_ENV=prod  -> kein server-Block, App nutzt gebündeltes dist/
```

## Änderungen

1. `capacitor.config.ts` umbauen
   - `server`-Block nur setzen, wenn `process.env.CAP_ENV === "dev"`.
   - Sonst weglassen, Capacitor lädt `webDir: "dist"`.

2. `package.json` Scripts ergänzen
   - `cap:dev`  -> `CAP_ENV=dev npx cap sync android`
   - `cap:prod` -> `npm run build && CAP_ENV=prod npx cap sync android`
   - `cap:open` -> `npx cap open android`

3. Kurzer Abschnitt "Mobile Build" in `README.md`
   - Wann Dev vs. Prod
   - Befehlsreihenfolge für die Release-APK
   - Hinweis auf signierten Release-Build in Android Studio (Build -> Generate Signed Bundle / APK)

## Workflow danach

Dev (Hot Reload aus der Sandbox):
```bash
npm run cap:dev
npm run cap:open
```

Production-APK (offline, eigenständig):
```bash
npm run cap:prod
npm run cap:open
# Android Studio: Build -> Build APK(s)                       (Debug)
# oder:           Build -> Generate Signed Bundle / APK       (Release, signiert)
```

## Technische Details
- Keine Änderungen am React-Code nötig.
- `.env` bleibt unberührt; `CAP_ENV` wird nur beim `cap sync` gelesen.
- Bestehender `android/`-Ordner bleibt kompatibel; nur `capacitor.config.json` im Android-Projekt wird beim Sync neu geschrieben.
- Für signierte Release-APKs: Keystore einmalig in Android Studio anlegen; Lovable speichert keinen Keystore.
