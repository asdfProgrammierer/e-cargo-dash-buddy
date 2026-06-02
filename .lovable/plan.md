# Native Fahrer-App mit Capacitor

Ziel: Die bestehende Web-App als echte native Android/iOS-App auf dein Handy bringen — mit Hot-Reload aus dem Lovable-Sandbox während der Entwicklung.

## Was ich im Projekt mache

1. **Capacitor installieren**
   - `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`

2. **`capacitor.config.ts` im Projekt-Root anlegen**
   - `appId`: `app.lovable.eb7a8883e02647dc82bb300906e3fa89`
   - `appName`: `e-cargo-dash-buddy`
   - `server.url`: Lovable-Sandbox-URL (Hot-Reload aufs Handy)
   - `server.cleartext`: true

Das war's auf der Lovable-Seite — Capacitor braucht keine weiteren Code-Änderungen, weil die App schon eine ganz normale Vite/React-App ist.

## Was du danach auf deinem eigenen Rechner machst

Capacitor kann **nicht** in der Lovable-Sandbox laufen — die nativen Projekte (Android Studio / Xcode) müssen lokal gebaut werden.

```text
1. Projekt nach GitHub exportieren (Button oben rechts)
2. git clone <dein-repo>
3. npm install
4. npx cap add android      (und/oder: npx cap add ios)
5. npx cap update android
6. npm run build
7. npx cap sync
8. npx cap run android      (Handy per USB + USB-Debugging an)
```

Für **iOS** brauchst du einen Mac mit Xcode. Für **Android** reicht Android Studio (Windows/Mac/Linux).

Bei jedem späteren `git pull` einfach erneut `npm install && npm run build && npx cap sync` ausführen.

## Hinweise zu Push-Notifications

Der bereits gebaute Web-Push-Code (Service Worker + VAPID) funktioniert in der nativen App **nicht** direkt — Android/iOS nutzen FCM/APNs. Wenn du native Push willst, müssten wir später `@capacitor/push-notifications` ergänzen. Für den ersten Wurf reichen die In-App-Toasts via Supabase Realtime.

## Referenz

Lovable hat dazu einen ausführlichen Blogpost: https://lovable.dev/blog/2025-04-22-using-lovable-with-capacitor-build-mobile-apps

Soll ich loslegen?
