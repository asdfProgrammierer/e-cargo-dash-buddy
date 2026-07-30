# Performance-Optimierung (ohne Funktionsverlust, ohne Sicherheitsabstriche)

Ziel: spürbar schnellere Ladezeiten in Dashboard, Aufträgen, Routenplanung und Fahrer-App. Keine Funktion wird entfernt, keine Berechtigung gelockert.

## Was aktuell bremst (gemessen)

- Die Routen-Liste ist die mit Abstand teuerste Datenbankabfrage: 1.239 Aufrufe, im Schnitt 233 ms, Spitze ~5 s. Sie lädt `routes.*` inklusive der sehr großen `geometry`-Spalte (komplette Kartenlinie), obwohl die Liste sie nicht anzeigt.
- Die Tabelle `routes` hat außer dem Primärschlüssel keinen Index — Filter nach `datum` und Sortierungen laufen als Full Scan.
- Aufträge werden im Händler-Dashboard mit `select("*")` und ohne Limit geladen; für die tatsächliche Abfrage (`user_id` + `is_pickup` + Sortierung nach `created_at`) gibt es keinen passenden Index.
- Weitere Seiten (Adressbuch, Fahrer, Fahrzeuge, Depots, Wartung, Profil) laden ebenfalls `select("*")`.
- Schwere Bibliotheken (Karten/Leaflet, PDF-Erzeugung, Excel, Diagramme) werden statisch importiert und landen im Bundle, auch wenn die Seite sie nie nutzt.
- Es gibt keine React-Query-Standardwerte: identische Daten werden bei jedem Seitenwechsel neu geholt (erklärt u. a. 5.642 Wiederholungen der Depot-/Routen-Abfragen).

## Geplante Maßnahmen

1. Datenbank-Indizes ergänzen (rein additiv)
   - `routes(datum DESC)` und `routes(driver_id, datum)`
   - `orders(user_id, created_at DESC) WHERE is_pickup = false`
   - `address_book(user_id)`
2. Nur benötigte Spalten laden
   - Routenlisten ohne `geometry`; die Geometrie wird nur in der Detail-/Kartenansicht nachgeladen.
   - `select("*")` in den Listenansichten durch explizite Spaltenlisten ersetzen — gleiche Anzeige, deutlich kleinere Antworten.
3. Aufträge serverseitig begrenzen
   - Die vorhandene Seitengröße (25 / 50 / alle) wird auch beim Laden berücksichtigt, statt immer alle Aufträge zu holen. „Alle“ bleibt möglich.
4. Caching aktivieren
   - Sinnvolle React-Query-Standards (`staleTime`, kein Refetch bei jedem Fensterfokus), damit Stammdaten wie Depots, Fahrer, Fahrzeuge und Lieferzonen nicht bei jedem Seitenwechsel neu geladen werden. Realtime-Updates bleiben unverändert aktiv.
5. Bundle verkleinern
   - Leaflet/Heatmap, PDF- und Excel-Bibliotheken erst beim tatsächlichen Öffnen bzw. Klick nachladen (dynamischer Import).
   - Manuelle Chunk-Aufteilung in der Build-Konfiguration für Vendor-Pakete.

## Sicherheit

Keine Änderung an RLS, Policies, Grants, Edge-Function-Auth oder Rollenlogik. Die Spaltenreduktion verringert zusätzlich die ausgelieferte Datenmenge (Datenminimierung). Alle Indizes sind reine Lesebeschleuniger.

## Prüfung nach Umsetzung

- Erneute Messung der langsamsten Abfragen und Vergleich mit den heutigen Werten.
- Durchklicken von Dashboard, Aufträge, Routenplanung, Statistiken, Adressbuch und Fahrer-Route, um unveränderte Funktion zu bestätigen.