## Ziel

In der Routenplanung (`/admin/routen`) sollen sich neue Bestellungen nach **Lieferzonen** (Zone A, B, C, D … wie im Bereich „Lieferzonen" angelegt) filtern lassen. Es werden dann nur Bestellungen aus den ausgewählten Zonen in der Liste „Neue Sendungen" angezeigt – und damit auch nur die für die Route ausgewählt/hinzugefügt.

## Was wird gebaut

### 1. Zonen laden
- In `RoutenplanungPage.tsx` zusätzlich zu Routen/Fahrern/Fahrzeugen/Depots auch die aktiven Lieferzonen mit ihren PLZ laden (`delivery_zones` + `delivery_zone_postcodes`, nur `active = true`).
- Eine Map `postcode → zone` aufbauen, um jeder neuen Bestellung anhand `empfaenger_plz` eine Zone zuzuordnen.

### 2. Zonen-Filter UI in „Neue Sendungen"
- Im Header der `NewOrdersTable` (neben Suche/„Anzeigen"/„Zur Route") ein neues **Multi-Select-Dropdown „Zonen"** einfügen.
  - Optionen: alle aktiven Zonen (Anzeige: farbiger Punkt + Zonen-Label/-Name) + Eintrag „Ohne Zone" für PLZ, die keiner Zone zugeordnet sind.
  - Ohne Auswahl = keine Filterung (alle Zonen).
  - Auswahl wird als Badge-Reihe sichtbar mit „Zurücksetzen"-Button.
- In jeder Zeile der Tabelle wird zusätzlich eine kleine **Zonen-Badge** (Label + Farbe via `getZoneBadgeStyle`) hinter PLZ/Stadt angezeigt – damit man auf einen Blick sieht, welche Zone eine Bestellung hat.

### 3. Filter-Logik
- Vor dem Rendern: `filteredOrders = orders.filter(o => selectedZones.size === 0 || selectedZones.has(zoneIdFor(o.empfaenger_plz) ?? "none"))`.
- Suche und Zonen-Filter wirken kombiniert (UND).
- „Alle auswählen" wählt nur die aktuell sichtbaren (gefilterten) Bestellungen mit Koordinaten aus.
- Auswahl, die durch Filterung unsichtbar wird, bleibt im State – wird aber visuell nicht mehr in der Liste angezeigt (entspricht heutigem Verhalten beim Suchen).

### 4. Optional: Karten-Layer beachtet Filter
- Die Map (`RoutesOverviewMap`) bekommt ebenfalls die gefilterte Liste „neuer Sendungen", damit Pins auf der Karte konsistent zur Tabelle sind, wenn der Schalter „Anzeigen" aktiv ist.

## Technische Details

- **Datenquelle**: `delivery_zones (id, name, label, color, sort_order, active)` + `delivery_zone_postcodes (zone_id, postcode)` – RLS erlaubt SELECT für authentifizierte Nutzer auf aktive Zonen, also kein Migration-Bedarf.
- **Helper**: kleine Util-Funktion `buildPostcodeZoneMap(zones)` → `Map<string, ZoneInfo>`; `zoneInfoFor(plz)` normalisiert via vorhandener `normalizePostcode` (`src/lib/deliveryCoverage.ts`).
- **State**: `selectedZoneIds: Set<string>` in `RoutenplanungPage` (per Route-Zustand nicht nötig, rein UI). Wird per Props an `NewOrdersTable` durchgereicht, zusammen mit `zones` und `zoneByPostcode`.
- **UI-Bibliothek**: bestehendes `DropdownMenu` mit `DropdownMenuCheckboxItem` für Multi-Select, `Badge` mit `getZoneBadgeStyle(zone.color)` für Anzeige.
- **Keine DB-Änderungen, keine RLS-Änderungen, keine Edge Functions.**

## Geänderte Dateien

- `src/pages/admin/RoutenplanungPage.tsx` – Zonen + Postcode-Map laden, State für Zonen-Filter, Props an `NewOrdersTable` weitergeben, gefilterte Liste auch an `RoutesOverviewMap`.
- `src/components/admin/NewOrdersTable.tsx` – Filter-Dropdown im Header, Filterlogik, Zonen-Badge je Zeile.
- (Neu, klein) `src/lib/deliveryZoneLookup.ts` – Helper für `Map<postcode, zone>` und Lookup-Funktion.

## Nicht im Scope

- Automatisches Zuweisen ganzer Zonen an Routen (Single-Click „alle aus Zone A → Route"). Kann später als Erweiterung hinzukommen, wenn gewünscht.
- Anpassung des Etiketten-Druckes oder anderer Seiten – Zonen-Logik bleibt auf die Routenplanung beschränkt.
