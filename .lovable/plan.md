## Ziel

Klare Verknüpfung der Stati zwischen Route, Stopps und Aufträgen entlang des Fahrer-Workflows:

```text
[geplant]  ──[Route starten]──►  [aktiv]  ──[alle Stopps fertig]──►  [abgeschlossen]
   │                                │                                       │
Aufträge: in_bearbeitung    →  unterwegs                  →  zugestellt / nicht_zugestellt
                                                                            │
                                                                 Navigation zum Hauptdepot
```

## Workflow im Detail

1. **Route starten (Fahrer)**
   - Neuer Button „Route starten" in `DriverRouteDetailPage`, sichtbar wenn `routes.status = 'geplant'`.
   - Setzt `routes.status = 'aktiv'` und alle zugehörigen `orders.status` von `in_bearbeitung` (oder `neu`) auf `unterwegs`.
   - Löst die bestehende E-Mail „Sendung unterwegs" automatisch über die normale Order-Status-Logik aus.

2. **Stopps abarbeiten** (bestehende Logik)
   - „OK" → `route_stops.status = 'erledigt'` + `orders.status = 'zugestellt'` (bereits vorhanden).
   - „Nicht zugestellt" → `uebersprungen` + `nicht_zugestellt` (bereits vorhanden).

3. **Route automatisch abschließen**
   - Sobald **alle** Stopps `erledigt` oder `uebersprungen` sind:
     - `routes.status = 'abgeschlossen'`.
     - Im UI erscheint statt Stopp-Liste eine Abschluss-Karte „Route abgeschlossen – zurück zum Depot".
     - **Automatischer Start der Navigation** zum `end_depot_id` (Fallback: `start_depot_id` bzw. Default-Depot) über die bereits vorhandene `navigate()`-Logik (Apple Maps / Google Navigation Deep-Link).

## Technische Umsetzung

### Edge Function – neu: `driver-start-route`
- Input: `{ route_id }`.
- Verifiziert per `is_route_driver(route_id)`, dass der eingeloggte Fahrer die Route besitzt.
- Prüft `routes.status = 'geplant'`, sonst 409.
- Service-Role Update:
  - `routes.status = 'aktiv'`.
  - `orders.status = 'unterwegs'` für alle Orders dieser Route, deren Status aktuell `neu` oder `in_bearbeitung` ist (kein Downgrade von bereits `zugestellt` etc.).
- Antwort: `{ ok: true, updated_orders: n }`.

### Edge Function – Erweiterung: `driver-update-stop-status`
- Nach erfolgreichem Stop-Update prüfen, ob für diese Route **kein** offener Stopp mehr existiert.
- Falls ja: `routes.status = 'abgeschlossen'` setzen.
- In der Response zusätzlich `route_completed: true` und `end_depot: { lat, lng, adresse }` zurückgeben (geladen via `routes.end_depot_id` → `depots`-Tabelle, Fallback auf `start_depot_id` oder Default-Depot).

### Frontend – `src/pages/driver/DriverRouteDetailPage.tsx`
- `route`-State erweitern um `status`, `start_depot`, `end_depot`.
- **„Route starten"-Banner** (oberhalb des Nächster-Stopp-Banners) wenn `route.status === 'geplant'`. Klick ruft `driver-start-route` auf, lädt neu und zeigt Toast „Route gestartet".
- Solange `route.status === 'geplant'`: OK-/Nicht-zugestellt-Buttons deaktiviert mit Hinweis „Bitte zuerst Route starten".
- Nach `submitDelivery`/`updateStatus`: wenn Response `route_completed`, automatisch:
  - Toast „Route abgeschlossen – Navigation zum Depot startet".
  - `navigate({...})` mit Depot-Adresse/Koordinaten aufrufen (gleiche Deep-Link-Logik wie für Stopps, neue Hilfsfunktion `navigateToDepot(depot)`).
  - UI in „Abschluss-Modus" schalten (Stopp-Liste ausgegraut, große Karte „Zurück zum Depot" mit erneutem Navigations-Button).

### Frontend – `src/pages/driver/DriverHomePage.tsx`
- Status-Badge je Route: `geplant` / `aktiv` / `abgeschlossen` (farblich: muted / primary / success).
- Sortierung: aktive Routen zuerst, dann geplante, dann abgeschlossene des Tages.

### Admin-Sicht
- Bestehende Routen-Listen zeigen den `aktiv`/`abgeschlossen`-Status automatisch (kein Code-Change nötig, nur ggf. Badge-Farben in `RoutesOverviewMap`/`RouteDetailPage` prüfen).

## Edge Cases

- **Bereits aktive Route bei App-Reload**: Button „Route starten" wird nicht mehr angezeigt, normale Stopp-Bearbeitung möglich.
- **Letzter Stopp = uebersprungen**: Route trotzdem abgeschlossen; Heimfahrt startet ebenfalls.
- **Kein Depot hinterlegt**: Toast „Kein Depot konfiguriert", keine Auto-Navigation; Route wird trotzdem abgeschlossen.
- **Order-Status-Trigger**: `prevent_non_admin_order_status_change` greift nicht, da Updates über Service-Role laufen.

## Geänderte / neue Dateien

- **neu**: `supabase/functions/driver-start-route/index.ts`
- **bearbeitet**: `supabase/functions/driver-update-stop-status/index.ts` (Auto-Abschluss + Depot-Antwort)
- **bearbeitet**: `src/pages/driver/DriverRouteDetailPage.tsx` (Start-Button, Abschluss-Flow, Depot-Navigation)
- **bearbeitet**: `src/pages/driver/DriverHomePage.tsx` (Status-Badges)

Keine Schema-Änderungen nötig – `route_status`-Enum (`geplant`/`aktiv`/`abgeschlossen`) und `depots`-Verknüpfungen existieren bereits.
