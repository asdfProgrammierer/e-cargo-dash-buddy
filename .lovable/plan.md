# Plan: 4 neue Funktionen

Reihenfolge nach Aufwand & Nutzen. Bei Bedarf können wir auch nur Teile umsetzen.

---

## 1. GPS-Stempel beim Abschluss (klein, hoher Nutzen)

**Ziel:** Bei jedem Stop-Abschluss (zugestellt oder nicht_zugestellt) werden Koordinaten + Genauigkeit erfasst und gespeichert. Sichtbar im Admin-Stop-Detail und im PDF-Lieferschein.

**Umsetzung:**
- Migration: `route_stops` bekommt `completed_lat numeric`, `completed_lng numeric`, `completed_accuracy_m numeric`.
- Fahrer-App (`DriverRouteDetailPage.tsx`): vor dem Submit `navigator.geolocation.getCurrentPosition()` mit `enableHighAccuracy`, 8s Timeout. Bei Ablehnung/Fehler: trotzdem speichern lassen, GPS-Felder bleiben leer (kein Blocker).
- Edge Function `driver-update-stop-status`: nimmt `lat`, `lng`, `accuracy` entgegen und schreibt sie.
- PDF (`orderPdf.ts`): kleine Zeile unter Zustellinfo: „GPS: 51.5123, 7.4720 (±12 m)" inkl. Link auf Google Maps.
- Admin-Stop-Detail: gleiche Zeile + „Auf Karte zeigen".

---

## 2. Händler-Dashboard Analytics (mittel)

**Ziel:** Vorhandenes `DashboardPage` um aussagekräftige KPIs erweitern.

**Neue Widgets:**
- **Zustellquote** der letzten 30 Tage (zugestellt / abgeschlossen).
- **Ø Zustellzeit** (created_at → delivered_at).
- **Retouren-/Hindernisquote** mit Top-3-Gründe (aus `order_status_history.reason` für `nicht_zugestellt`).
- **Top 10 Empfänger** (nach Sendungsmenge, letzte 90 Tage).
- **Wochentag-Verteilung** (Bar-Chart: Mo–So Sendungsvolumen).
- Datumsfilter (7d / 30d / 90d / benutzerdefiniert) gilt für alle Widgets.

**Umsetzung:**
- Reine Frontend-Aggregation aus `orders` + `order_status_history` via vorhandener RLS (`merchant_owner_id`).
- Recharts (schon im Projekt) für Visualisierung.
- Keine DB-Änderungen nötig.

---

## 3. Push-Benachrichtigungen (mittel-groß)

**Ziel:** Echtzeit-Push an Fahrer (neue Route zugewiesen) und Admin (Stop als „Hindernis"/„nicht zugestellt" gemeldet). App ist Capacitor-fähig → Web Push + Capacitor Push parallel.

**Empfohlener Stack:** Web Push (VAPID) für PWA/Browser + späterer FCM-Hop für native App.

**Umsetzung – Phase A (Web Push, jetzt):**
- Migration: `push_subscriptions` (user_id, endpoint, p256dh, auth, platform, created_at).
- Service Worker registrieren, Subscribe-Flow bei Login bzw. „Benachrichtigungen aktivieren" Button im Header/Profil.
- Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (lege ich an, frage Werte ab).
- Edge Function `send-push`: nimmt user_ids + Payload, sendet via Web-Push-Protocol (npm:web-push).
- Trigger-Punkte:
  - Beim Zuweisen einer Route → Push an betroffenen Fahrer.
  - Beim Stop-Status `hindernis`/`nicht_zugestellt` → Push an alle Admins.
  - Neue Notification (`notifications` Tabelle) → Push an Zielgruppe.

**Phase B (Capacitor/FCM, später):** Nur falls native Apps gebaut werden – separate Aufgabe.

---

## 4. Offline-Modus für Fahrer (groß, anspruchsvoll)

**Ziel:** Fahrer kann ohne Netz Stops abschließen, Fotos/Signaturen erfassen; Sync sobald wieder online.

**Architektur:**
- **IndexedDB-Cache** (Dexie.js) für: aktuelle Route, Stops, Order-Daten, gepflegte Lieferanweisungen.
- **Outbox-Queue** für Mutationen (Stop-Update, Foto, Signatur). Jeder Eintrag mit `id`, `payload`, `attempts`, `created_at`.
- **Background-Sync:** beim `online`-Event und alle 30s, wenn online → Edge Function `driver-update-stop-status` mit gleichem Payload erneut aufrufen. Idempotenz über `client_op_id` (UUID pro Operation).
- **UI:**
  - Offline-Badge in `DriverLayout` (rot wenn offline, gelb wenn Outbox > 0).
  - Stop-Liste zeigt „Wird synchronisiert…" bis Server bestätigt.
  - Fotos werden lokal als Blob in IndexedDB gehalten (max. 1280px JPEG, ~150 KB pro Foto).
- **Edge Function Anpassung:** `client_op_id` akzeptieren, doppelte Uploads abfangen (Unique-Index auf neuer Spalte `route_stops.client_op_id`).

**Aufwand:** ca. 1,5–2× so groß wie die anderen drei zusammen. Empfehlung: zuletzt umsetzen, ggf. nach kurzer Pilotphase mit den ersten 3 Features.

---

## Technische Details

**Migrations:**
- `route_stops`: `+ completed_lat`, `+ completed_lng`, `+ completed_accuracy_m`, `+ client_op_id uuid unique nullable`.
- Neue Tabelle `push_subscriptions` mit RLS (user sieht/insertet nur eigene, service_role alles).

**Edge Functions:**
- `driver-update-stop-status` (vorhandene) — neue Felder.
- `send-push` (neu).

**Secrets neu:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generiere ich automatisch beim Setup).

**Frontend-Pakete:** `dexie` (für Offline), `web-push` (im Edge Function).

---

## Reihenfolge / Vorschlag

```text
1. GPS-Stempel           (~30 Min)
2. Händler-Analytics     (~60 Min)
3. Push (Web Push)       (~90 Min)
4. Offline-Modus         (~3-4 h)
```

**Frage vor Start:** Sollen wir alle 4 nacheinander in einem Rutsch umsetzen, oder möchtest du nach jedem Schritt testen, bevor wir weitermachen? Empfehlung: nach Schritt 1 und 3 jeweils kurz testen.
