# Abhol-Auftrag-Logik vereinfachen

Statt eines minütlichen Cron-Jobs mit Deadline-Gate wird der Abhol-Auftrag **automatisch erzeugt, sobald ein Händler am passenden Wochentag seine erste reguläre Sendung des Tages anlegt**.

## Neue Logik (DB-Trigger)

Migration mit einem `AFTER INSERT`-Trigger auf `public.orders`:

- Feuert nur, wenn `NEW.is_pickup = false`
- Lädt das Händler-Profil: muss `pickup_enabled = true` und `approved = true` sein, und der aktuelle Berlin-Wochentag muss in `pickup_weekdays` enthalten sein
- Prüft, ob heute (Berlin-Tag) bereits ein `is_pickup = true`-Auftrag für diesen `user_id` existiert → wenn ja, nichts tun
- Andernfalls `INSERT` eines Abhol-Auftrags mit Absender = Empfänger = Händler-Adresse, `pakete=1`, `gewicht=0`, `notizen='[ABHOLUNG] Automatisch generierter Abhol-Auftrag'`, `is_pickup=true`
- Geocoding erfolgt nicht im Trigger (kein Netzwerk in Postgres). Die bestehende automatische Geocodierung auf der Routenplanungsseite holt die Koordinaten beim nächsten Aufruf nach — derselbe Mechanismus, der heute schon für Empfänger-Adressen läuft.

Trigger ist `SECURITY DEFINER` mit gepinntem `search_path`, damit RLS umgangen werden kann.

## Aufräumen

- Cron-Job `generate-pickup-orders-daily` per `cron.unschedule(...)` entfernen
- Edge Functions löschen: `generate-pickup-orders`, `regeocode-pickup-orders`
- Tabelle `public.pickup_cron_settings` droppen
- DB-Funktionen entfernen: `admin_get_pickup_cron_status`, `admin_get_pickup_cron_runs`, `admin_set_pickup_deadline`
- Frontend: `src/pages/admin/PickupCronPage.tsx` löschen, Route in `App.tsx` entfernen, Sidebar-/Settings-Verlinkung entfernen
- `PickupSettingsCell` (pickup_enabled + pickup_weekdays am Händler) bleibt — das ist weiterhin der Schalter, mit dem ein Admin Abholung pro Händler steuert

## Was unverändert bleibt

- Profil-Felder `pickup_enabled` und `pickup_weekdays`
- `orders.is_pickup` und die UI-Darstellung von Abhol-Aufträgen
- Auftrags-Nummern-Generator (`generate_auftrags_nr` behandelt `is_pickup` schon korrekt mit `-P…`)

## Effekt für den Nutzer

- Keine Settings-Seite, kein Deadline-Tuning, keine Cron-Logs mehr nötig
- Abhol-Auftrag erscheint sofort beim Anlegen der ersten Sendung des Tages → kein Warten bis 14:00
- Wird am jeweiligen Tag keine Sendung angelegt, entsteht auch kein Abhol-Auftrag (gleiches Verhalten wie heute)
