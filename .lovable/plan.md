
# Admin-Übersicht erweitern

Die Seite `Admin → Übersicht` wird um drei neue Bereiche ergänzt, ohne die bestehende Bestellliste zu verändern.

## 1. Bestellungen mit Hindernissen
Neue Karte oberhalb der bestehenden Bestelltabelle:
- Listet alle aktuell offenen Aufträge mit Status `nicht_zugestellt`.
- Pro Eintrag: Auftragsnr., Händler, Empfänger/Stadt, Anzahl Zustellversuche, letzter Grund (aus `order_status_history`), Datum.
- Klick öffnet das vorhandene `OrderDetailSheet` (gleicher Flow wie Bestelltabelle).
- Badge mit Gesamtzahl + "Alle anzeigen"-Button, der zur Auftragsseite mit Filter `nicht_zugestellt` springt.

## 2. Erweiterte Filter über der Bestelltabelle
Aktuell nur Status-Filter. Ergänzung:
- **Zeitraum**: Heute / 7 Tage / 30 Tage / Alle (Dropdown).
- **Händler**: Suchfeld/Combobox über alle Händler (Filterung clientseitig).
- **Stadt**: Freitext-Filter auf `empfaenger_stadt`.
- **Suche**: Volltext (Auftragsnr., Empfänger, Tracking).
- Filterleiste ersetzt die bisherige Header-Ecke der Bestellungen-Card und bleibt sticky beim Scrollen innerhalb der Card.
- "Filter zurücksetzen"-Link wenn aktiv.

## 3. Fahrzeug- & Wartungsmeldungen
Neue Karte ("Fahrzeugmeldungen") unterhalb der KPI-Kacheln, zweispaltig:

**Spalte A – Anstehende Wartungen** (aus `maintenance_schedule`)
- Einträge mit `status != 'erledigt'` und `faellig_am <= today + 14 Tage`.
- Ampel: rot (überfällig), gelb (≤ 7 Tage), grün (8–14 Tage).
- Zeile: Fahrzeug-Kennzeichen, Typ, Bezeichnung, fällig am, Kosten (optional).
- Klick → `/admin/fahrzeuge/:id`.

**Spalte B – Sicherheitscheck-Status** (aus `vehicle_inspections`)
- Pro Fahrzeug letzten Check ermitteln. Ampel:
  - rot: kein Check ODER letzter Check älter als 14 Tage ODER eines der `*_ok` Felder false
  - gelb: Check 11–14 Tage alt
  - grün: Check ≤ 10 Tage und alles ok
- Zeile: Kennzeichen, Datum letzter Check, kurze Liste der Mängel.

Beide Spalten zeigen Top 5 + "Alle anzeigen"-Link zu `/admin/fahrzeuge`.

## 4. Mini-KPIs aktualisieren
Bestehende vier Kacheln bleiben. Zwei zusätzliche kleine Indikatoren in der neuen Fahrzeugmeldungen-Karte:
- "Wartungen offen": Anzahl.
- "Fahrzeuge mit Warnung": Anzahl rot+gelb aus Sicherheitscheck.

## Technische Details

- Eine `AdminDashboardPage.tsx` bleibt bestehen; neue Sub-Komponenten:
  - `src/components/admin/dashboard/ObstacleOrdersCard.tsx`
  - `src/components/admin/dashboard/OrderFiltersBar.tsx`
  - `src/components/admin/dashboard/VehicleAlertsCard.tsx`
- Daten:
  - Hindernisse: `orders` + neuester Eintrag aus `order_status_history` pro Order (kann clientseitig gejoint werden, da bereits beides geladen wird; alternativ ein zusätzlicher `select` auf `order_status_history` mit `status=nicht_zugestellt` der letzten 30 Tage).
  - Wartungen: `maintenance_schedule` join `vehicles` (Kennzeichen).
  - Inspektionen: `vehicle_inspections` mit `vehicle_id` group by latest.
- Alle neuen Queries respektieren die existierenden Admin-RLS-Policies (Admin sieht alles).
- Realtime nicht zwingend nötig; die Seite lädt beim Mount + nach Order-Erstellung neu.
- Keine Schema-Änderungen erforderlich.
- Filterzustand wird im Component-State gehalten (kein URL-Param), aber `localStorage` merkt sich die letzten Filter.

## Out of scope
- Neue Tabellen oder Migrationen.
- Änderungen an Bestelldetail-Sheet oder Email-Flows.
- Push-/Toast-Benachrichtigungen über neue Hindernisse (kann später ergänzt werden).
