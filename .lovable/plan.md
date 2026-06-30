# Zeiterfassung pro Fahrer

Brutto-Fahrzeit erfassen: **Start** wenn Fahrer Route auf "aktiv" schaltet, **Ende** automatisch sobald die Background-GPS-Position innerhalb von **150 m** um das End-Depot der Route liegt.

## Datenbank

Neue Tabelle `public.driver_work_sessions`:
- `driver_id`, `route_id`, `start_depot_id`, `end_depot_id`
- `started_at`, `ended_at`, `duration_seconds` (generated)
- `end_reason` (`auto_depot` | `manual` | `route_completed`)
- RLS: Fahrer sehen/erzeugen nur eigene Sessions, Admins sehen alles.
- Indexe auf `(driver_id, started_at)`.

Neue RPCs (SECURITY DEFINER):
- `driver_start_work_session(_route_id uuid)` — schließt offene Sessions des Fahrers, legt neue an, setzt `start_depot_id`/`end_depot_id` aus `routes`.
- `driver_end_work_session(_reason text)` — beendet die aktuell offene Session des Fahrers (idempotent).
- `admin_driver_time_stats(_driver_id uuid)` — Aggregat pro Tag (gesamt Sekunden + Anzahl Sessions, letzte 90 Tage).

Erweiterung `driver_update_location`: nach Insert prüfen, ob eine offene Session existiert und Position < 150 m am `end_depot` → `driver_end_work_session('auto_depot')` aufrufen. Distanz via Haversine in PL/pgSQL (kein PostGIS nötig).

## Fahrer-App

`DriverRouteDetailPage.tsx`:
- Beim Wechsel des Route-Status auf `aktiv` → `driver_start_work_session(routeId)` aufrufen (zusätzlich zu bestehender `driver-start-route` Edge Function).
- Bestehender Background-GPS-Watcher (`backgroundGps.ts`) sendet weiterhin alle 60 s Positionen — Auto-Stopp passiert serverseitig.
- Optionaler manueller "Schicht beenden"-Button entfällt (User wünscht nur Auto-Stopp via GPS).

## Admin-Statistiken

`DriverStatsDialog.tsx` bekommt einen neuen Abschnitt **„Arbeitszeit"**:
- KPIs: Gesamtstunden (30 T / 90 T), ⌀ Stunden/Tag (aktiv), Anzahl Routen.
- Tagesliste (letzte 30 Tage, scrollbar): Datum · Start–Ende · Dauer (hh:mm) · Routen-Link.
- Tage mit mehreren Sessions werden summiert und einzeln aufgeklappt.

Datenquelle: neue RPC `admin_driver_time_stats`.

## Edge Cases

- Offene Session ohne Depot-Ankunft (Fahrer fährt nicht zurück): bleibt offen; eine nightly Cleanup-Funktion (`pg_cron`, 03:00) schließt Sessions > 14 h Laufzeit automatisch mit `end_reason='timeout'` und `ended_at = started_at + 14h`, damit die Statistik nicht verzerrt.
- Mehrere Routen am selben Tag: jede Route = eigene Session; Tageszeit ist die Summe.
- Falls `routes.end_depot_id` NULL ist, Fallback auf `start_depot_id`.

## Reihenfolge der Umsetzung

1. Migration: Tabelle + RLS + GRANTs + RPCs + Update auf `driver_update_location` + Cron-Cleanup.
2. Fahrer-App: Start-RPC beim Route-Aktivieren.
3. Admin-Dialog: neuer Tab „Arbeitszeit" mit KPIs und Tagesliste.
