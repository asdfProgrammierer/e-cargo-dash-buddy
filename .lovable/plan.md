## Ziel
Im Routen-Fenster der Routenplanung erhält jede Routenzeile im Hintergrund einen dezenten, dunkelgrünen Fortschrittsbalken, der zeigt, wie viele Stopps der Route bereits abgearbeitet wurden.

## Verhalten
- Balken erstreckt sich als Hintergrund über die gesamte Zeile.
- Aufgeteilt in `n` gleiche Segmente (n = Anzahl Stopps der Route).
- Ein Segment gilt als „erledigt", sobald der zugehörige Auftrag den Status `zugestellt` oder `nicht_zugestellt` hat.
- Fortschritt = (erledigte Stopps / gesamte Stopps).
- Farbe: dunkles Grün mit niedriger Opazität, damit Text lesbar bleibt; feine vertikale Trennlinien markieren die Segmente.
- Bei 0 Stopps kein Balken; bei 100 % voller Balken.
- Aktualisiert sich live über die bereits vorhandenen Realtime-Abos auf `route_stops` / `routes` bzw. den `refreshKey`.

## Umsetzung (technisch)
Datei: `src/pages/admin/RoutenplanungPage.tsx`
1. Neuer State `routeProgress: Record<string, { total: number; done: number }>`.
2. Neuer `useEffect`, der bei Änderung von `routesForDate` (IDs) und `refreshKey` einmalig lädt:
   ```ts
   supabase.from("route_stops")
     .select("route_id, orders(status)")
     .in("route_id", ids)
   ```
   Anschließend pro `route_id` aggregieren: `total` = Anzahl Zeilen, `done` = Anzahl mit `orders.status ∈ {zugestellt, nicht_zugestellt}`.
3. In der Routen-Map (Zeile ~599) den äußeren `div` auf `relative overflow-hidden` setzen und als erstes Kind einen Hintergrund-Layer rendern:
   ```tsx
   <div className="absolute inset-y-0 left-0 pointer-events-none"
        style={{
          width: `${(done / total) * 100}%`,
          background: "hsl(var(--primary) / 0.18)", // dunkelgrün, semantic token
        }} />
   ```
   Plus optional ein zweites Overlay mit `repeating-linear-gradient`, das alle `100/total %` eine 1px-Trennlinie zeichnet, damit die Segmentierung sichtbar ist.
4. Inhalt der Zeile in `relative z-10` wrappen, damit er über dem Balken liegt.
5. Kein neues Realtime-Abo nötig — der bestehende `refreshKey`-Mechanismus triggert Neuladen bei Statuswechseln.

## Nicht Teil dieses Plans
- Keine Änderung an Farbschema/Design-Tokens.
- Keine Änderung an der Stops-Liste oder der Karte.
