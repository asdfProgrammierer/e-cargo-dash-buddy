## Ziel

Beim Planen einer Route lässt sich eine **Startzeit** angeben. Daraus wird für jeden Stopp eine **ETA** berechnet — basierend auf der Fahrzeit (`leg_duration_s`) zwischen den Stopps **plus** einer konfigurierbaren **Stopp-Dauer** (Standard 4 Min), die jeder Stopp für Paketsuche/Übergabe braucht. Die Stopp-Dauer wird zentral in den Einstellungen gepflegt.

## Was der Nutzer sieht

1. **Route bearbeiten/anlegen** (Dialog auf `/admin/routen`): neues Feld **„Startzeit"** (`time`, Default 09:00) neben Datum.
2. **Stops-Liste** (RouteBuilder, kompakt): pro Stopp wird die **Ankunftszeit (ETA)** angezeigt, z. B. `09:14`. Wenn keine Optimierung gelaufen ist und keine `leg_duration_s` vorhanden sind, bleibt das Feld leer.
3. **Einstellungen → neuer Tab „Routen"**: Eingabefeld **„Stopp-Dauer (Minuten)"**, Default 4. Wird global gespeichert. Änderung wirkt sich auf neu berechnete ETAs aus.
4. **Optimieren-Button**: berechnet ETAs neu (Startzeit + kumulierte Fahrzeit + n × Stopp-Dauer).

## Technische Umsetzung

### 1. Datenbank (Migration)

- `routes`: neue Spalte `start_time time NOT NULL DEFAULT '09:00'`.
- Neue Tabelle `route_settings` (Singleton, RLS admin-only):
  - `id int PK default 1` (CHECK id = 1)
  - `stop_duration_minutes int NOT NULL DEFAULT 4`
  - `updated_at timestamptz default now()`
- `route_stops.eta` ist schon vorhanden (`timestamptz`) — wird befüllt.

### 2. Edge Function `optimize-route`

Nach dem Berechnen von `leg_duration_s` pro Stop:
- Lade `routes.datum` + `routes.start_time` + `route_settings.stop_duration_minutes`.
- Setze `cursor = datum + start_time` (UTC-konvertiert).
- Iteriere Stops in optimierter Reihenfolge:
  - `cursor += leg_duration_s` → `eta` für diesen Stop.
  - Schreibe `eta` in `route_stops`.
  - `cursor += stop_duration_minutes * 60` (Service-Zeit nach Ankunft).
- `routes.total_duration_s` = Fahrzeit + (n × Stopp-Dauer), damit „Fahrzeit gesamt" realistisch bleibt (alternativ separates `total_service_s` — wir bleiben bei einem Wert und benennen Anzeige in „Gesamtdauer").

### 3. Frontend

- **`RoutenplanungPage.tsx`**: 
  - `emptyForm` um `start_time: "09:00"` erweitern, Input `type="time"` im Dialog.
  - `handleSave` schickt `start_time` mit.
- **`RouteBuilder.tsx`** (kompakt):
  - In `SortableStop` neben den Kennzahlen die ETA aus `stop.eta` rendern (Format `HH:mm`).
  - `StopRow`-Interface um `eta: string | null` erweitern, im Select abrufen.
- **Neuer Tab „Routen"** in `SettingsTabs.tsx` + neue Page `src/pages/admin/RouteSettingsPage.tsx` mit Formular für `stop_duration_minutes` (Lesen/Schreiben aus `route_settings`). Route in `App.tsx` registrieren: `/admin/einstellungen/routen`.
- **CSV-Export** und **Druckansicht** (RouteDruckPage): ETA-Spalte ergänzen (kurz prüfen, ob nötig — falls nicht angefragt, nur CSV).

### 4. Live-Neuberechnung ohne Optimierung

Ändert der Nutzer nur die Startzeit oder die Stopp-Dauer ohne neu zu optimieren, werden ETAs clientseitig im RouteBuilder „on the fly" gerendert (Formel oben), damit sich Änderungen sofort widerspiegeln. Die DB-Werte (`route_stops.eta`) gelten nach dem nächsten „Optimieren" als verbindlich.

## Nicht enthalten

- Kein Pro-Stop-Override der Stopp-Dauer (nur global).
- Keine Pausen-/Mittagsfenster.
- Keine Benachrichtigung der Empfänger mit ETA.
