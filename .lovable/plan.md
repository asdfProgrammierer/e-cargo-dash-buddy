Ich baue die Routenoptimierung so um, dass gepinnte Stopps nicht mehr nur relativ geschützt werden, sondern exakt auf ihren Positionsnummern bleiben.

## Zielverhalten

- Ein gepinnter Stopp auf Position 1 bleibt nach der Optimierung Position 1.
- Ein gepinnter Stopp auf Position 13 bleibt Position 13.
- Ein gepinnter Stopp am Ende bleibt am Ende.
- Alle nicht gepinnten Stopps werden nur in den freien Bereichen zwischen den Pins optimiert.
- Nach Drag & Drop werden die neuen Positionen zuverlässig gespeichert.
- Nach der Optimierung wird die Karte/Geometrie sauber neu geladen.

Beispiel:

```text
Vorher:
01  PIN Abholung
02  frei
03  frei
04  frei
05  PIN wichtiger Zwischenstopp
06  frei
07  frei
08  PIN letzte Lieferung

Optimierung:
01  PIN Abholung bleibt exakt 01
02-04 werden optimiert
05  PIN Zwischenstopp bleibt exakt 05
06-07 werden optimiert
08  PIN letzte Lieferung bleibt exakt 08
```

## Umsetzung

1. **Backend-Funktion `optimize-route` umbauen**
   - Die aktuelle Logik, die freie Stopps heuristisch Segmenten zuweist, wird ersetzt.
   - Stattdessen werden Segmente ausschließlich aus den tatsächlichen Positionsbereichen berechnet:
     - vor dem ersten gepinnten Stopp
     - zwischen zwei gepinnten Stopps
     - nach dem letzten gepinnten Stopp
   - Jedes Segment wird separat optimiert.
   - Gepinnte Stopps werden anschließend wieder exakt an ihren ursprünglichen `position`-Index eingesetzt.

2. **Harte Validierung vor dem Speichern**
   - Prüfen, dass alle Stopps genau einmal im Ergebnis vorkommen.
   - Prüfen, dass keine Stopps verloren gehen oder doppelt auftauchen.
   - Prüfen, dass jeder gepinnte Stopp exakt dieselbe `position` behält.
   - Falls das nicht möglich ist, bricht die Optimierung mit einer klaren Fehlermeldung ab, bevor Daten gespeichert werden.

3. **Positions-Update robuster machen**
   - Stopps werden nach der final berechneten Reihenfolge auf `position = 1..n` geschrieben.
   - Für gepinnte Stopps wird explizit kontrolliert, dass die gespeicherte Position unverändert bleibt.
   - Leg-Distanzen, Fahrzeiten und ETA werden auf Basis der finalen Reihenfolge neu berechnet.

4. **Frontend-Drag-&-Drop anpassen**
   - Gepinnte Stopps selbst bleiben nicht verschiebbar, solange sie gelockt sind.
   - Nicht gepinnte Stopps dürfen per Drag & Drop verschoben werden.
   - Nach Drag & Drop werden alle Positionsfelder gespeichert.
   - Vor dem Optimieren wird die Route noch einmal frisch geladen, damit die Backend-Funktion nicht mit veralteten Positionen arbeitet.

5. **Karte nach Optimierung wirklich aktualisieren**
   - Nach erfolgreicher Optimierung wird die Route neu geladen.
   - Die bestehende Linienquelle/Layer der Karte wird ersetzt.
   - Marker und Nummerierung werden aus den frisch geladenen Stopps neu aufgebaut.
   - Zusätzlich wird die Map resized/repainted, damit keine alte Route sichtbar bleibt.

## Technische Details

- Es bleibt bei der bestehenden OSM/OpenRouteService-Integration und dem vorhandenen `ORS_API_KEY`.
- Es ist voraussichtlich keine Datenbankmigration nötig, weil `route_stops.pinned` und `route_stops.position` bereits existieren.
- Geändert werden voraussichtlich:
  - `supabase/functions/optimize-route/index.ts`
  - `src/components/admin/RouteBuilder.tsx`
- Die alte fehleranfällige Validierung/Segmentverteilung wird vollständig entfernt, nicht nur erweitert.

## Erwartetes Ergebnis

Danach sollte das Pinning nicht mehr zufällig oder relativ wirken, sondern wie ein echtes Positions-Lock:

```text
Pin = feste Positionsnummer
freie Stopps = optimierbar innerhalb der Lücken
```