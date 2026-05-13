## Ziel
Abhol-Aufträge sollen nur noch erzeugt werden, wenn der jeweilige Händler **am selben Tag (Berliner Zeit)** mindestens eine reguläre Bestellung erstellt hat.

## Änderung
Datei: `supabase/functions/generate-pickup-orders/index.ts`

In der Schleife über `eligible` Händler vor dem Insert eine zusätzliche Prüfung einbauen:

```text
SELECT id FROM orders
WHERE user_id = m.user_id
  AND is_pickup = false
  AND created_at >= today 00:00 Berlin
  AND created_at <  today 24:00 Berlin
LIMIT 1
```

- Wenn **kein** Treffer → Händler überspringen mit `status: "skipped_no_orders"`.
- Wenn Treffer → bisherige Logik (existierende Abholung prüfen, ggf. Geocoding + Insert).

Die Berliner-Tagesgrenzen werden korrekt als UTC-ISO-Strings berechnet (analog zur bestehenden `berlinDateString`-Logik, aber mit Zeitzonen-Offset), damit Sommer-/Winterzeit stimmt. Pragmatisch reicht ein Fenster von `today 00:00 Europe/Berlin` bis `+ 24h`, umgerechnet via `Date` mit `toLocaleString("en-US", { timeZone: "Europe/Berlin" })`-Trick oder einfacher: Vergleich auf das Berliner Kalenderdatum mittels `to_char(created_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') = today`.

→ Da Supabase JS keinen `AT TIME ZONE`-Helper bietet, wird im Code ein UTC-Range gebildet:
- `startUtc = new Date(`${today}T00:00:00+01:00 oder +02:00`)` – Offset wird via `Intl.DateTimeFormat` mit `timeZoneName: "shortOffset"` ermittelt.
- `endUtc = startUtc + 24h`.

## Reporting
Im Response-Array wird `skipped_no_orders` als zusätzlicher Status sichtbar, sodass im Admin-Cron-Log (`PickupCronPage`) erkennbar ist, warum übersprungen wurde. Toast-Meldung im Admin-Panel bleibt unverändert (zählt nur `created`/`skipped_exists`); optional könnte `skipped_no_orders` ergänzt werden.

## Nicht betroffen
- Deadline-Logik, Wochentag-Logik, Geocoding, RLS, DB-Schema, Trigger – alles bleibt.
- Frontend (PickupCronPage) muss nicht geändert werden, sofern wir die Toast-Zählung nicht erweitern.

## Offene Frage
Soll der neue Status `skipped_no_orders` im Admin-Toast ebenfalls angezeigt werden („X übersprungen, weil heute keine Bestellung")? Standardmäßig nein, da bestehende Anzeige ausreicht.
