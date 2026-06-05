## Ziel

Die Fahrer-App wird touchfreundlicher, das Unterschriftfeld funktioniert wieder, und Admins können die Übergabe-Modi (Persönlich, Briefkasten, Nachbar, …) inkl. Pflichtfelder zentral konfigurieren.

## 1. Admin-Konfiguration (neu)

**Neue Tabelle `delivery_modes`** mit Spalten:
- `key` (z.B. `persoenlich`, `briefkasten`, `nachbar`, `bemerkung`)
- `label` (Anzeigename für Fahrer)
- `active` (an/aus)
- `photo_required` (bool)
- `signature_required` (bool)
- `recipient_name_required` (bool)
- `sort_order`
- Standard-Modi werden beim Setup eingespielt.

**Neue Admin-Seite** „Einstellungen → Übergabe-Modi" mit Tabelle/Karten zum:
- Aktivieren/Deaktivieren
- Pflichtfeld-Toggles (Foto, Unterschrift, Empfängername)
- Label umbenennen, Reihenfolge ändern

RLS: Lesen für alle authenticated, Schreiben nur Admins.

## 2. Fahrer-App: Übergabe-Sheet überarbeiten

- Modi werden aus `delivery_modes` geladen (statt hardgecoded).
- Pflichtfeld-Validierung kommt aus der Konfiguration (Foto/Unterschrift/Name).
- **Tastatur-Fix:** Kein `autoFocus` auf Textareas/Inputs; Felder öffnen Tastatur erst bei Tap. Notiz- und Empfänger-Felder sind initial nicht fokussiert; Empfänger-Input nur eingeblendet wenn Modus es verlangt.
- Foto-/Unterschrift-Bereiche werden nur angezeigt wenn der gewählte Modus sie braucht.

## 3. Unterschriftfeld reparieren

Aktuell zeichnet die Linie nicht. Ursache: `SignaturePad` ruft `resize()` initial bevor das Sheet sichtbar ist → Canvas hat 0×0, Zeichnen schlägt fehl. Plus `touch-action` greift teils nicht.

Fix:
- Resize per `ResizeObserver` auf das Canvas-Element → reagiert sobald Sheet geöffnet wird.
- Pointer-Events robust (`touch-none`, `user-select-none`, explizit `touchAction: 'none'` als Style).
- Sicherstellen dass `pointercancel`/`pointerleave` Zeichnen sauber beenden ohne neuen Punkt zu schlucken.
- `isEmpty` über tatsächliche Pixelprüfung statt nur Flag, damit „Pflicht: Unterschrift" verlässlich greift.

## 4. Mobile-Buttons & Tap-Targets

Im gesamten Fahrer-Bereich (`DriverHomePage`, `DriverRouteDetailPage`, Sheets):
- Primäre Action-Buttons mind. **56 px** hoch (`h-14`), volle Breite, größere Schrift (`text-base font-semibold`).
- Stop-Karten: größere Touch-Bereiche, mehr vertikales Padding, „Navigieren / Zugestellt / Nicht zugestellt" als gut trennbare 3er-Buttonreihe statt enge Icons.
- Mehr Abstand zwischen Buttons (`gap-3`), `active:scale-[0.98]` für haptisches Feedback.
- Radio-Buttons für Modi werden zu großen Tap-Karten (ganze Zeile klickbar, min. 56 px Höhe).
- Bottom-Safe-Area Padding damit nichts hinter iOS-Home-Indikator verschwindet.

## 5. Technische Details

- Neue Migration: `delivery_modes` Tabelle + Seed der 4 bestehenden Modi + RLS + Grants.
- `driver-update-stop-status` Edge-Function: validiert Pflichtfelder serverseitig anhand der Tabelle.
- Frontend Hook `useDeliveryModes()` lädt + cached Modi.
- Admin-Route: `/admin/einstellungen/uebergabe-modi` (in Sidebar verlinken).

## Geänderte/neue Dateien

- `supabase/migrations/…_delivery_modes.sql` (neu)
- `src/pages/admin/DeliveryModesPage.tsx` (neu)
- `src/components/admin/AdminSidebar.tsx` (Link)
- `src/App.tsx` (Route)
- `src/hooks/useDeliveryModes.ts` (neu)
- `src/components/driver/SignaturePad.tsx` (Fix)
- `src/pages/driver/DriverRouteDetailPage.tsx` (Sheet + Buttons)
- `src/pages/driver/DriverHomePage.tsx` (Buttons)
- `src/components/driver/DriverLayout.tsx` (Safe-Area Padding)
- `supabase/functions/driver-update-stop-status/index.ts` (Server-Validierung)
