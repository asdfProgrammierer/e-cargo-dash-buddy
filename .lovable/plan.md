## Ziel

Jeder vom Fahrer als "Nicht zugestellt" markierte Auftrag muss durch einen Admin manuell bestätigt werden — egal ob 1., 2. oder 3. Versuch. Die Bestellung erscheint mit Hinweis "Bestätigung ausstehend" in der Karte **Bestellungen mit Hindernissen** im Admin-Dashboard. Per Button entscheidet der Admin:

- **Erneut zustellen** → Status zurück auf `neu`, Zustellzähler bleibt hochgezählt, Bestellung kommt wieder in die Routenplanung.
- **Endgültig nicht zugestellt** → Status bleibt `nicht_zugestellt`, Bestätigung gesetzt.

## Aktuelles Verhalten (zum Vergleich)

- Versuch 1–2: Edge Function setzt automatisch zurück auf `neu`.
- Versuch 3: automatisch endgültig `nicht_zugestellt`.
- Keine Admin-Interaktion notwendig.

## Neues Verhalten

- Jeder Fahrer-Skip setzt Auftrag sofort auf `nicht_zugestellt` mit Flag `delivery_unconfirmed = true`. `delivery_attempts` wird inkrementiert.
- `MAX_DELIVERY_ATTEMPTS`-Auto-Final entfällt — Admin entscheidet jedes Mal.
- Solange `delivery_unconfirmed = true`:
  - Auftrag erscheint in **Bestellungen mit Hindernissen** mit Badge „Bestätigung ausstehend".
  - Action-Buttons direkt in der Card und im Admin-OrderDetailSheet.
- Nach Admin-Entscheidung wird `delivery_unconfirmed = false`.

## Änderungen

### Datenbank (Migration)

- `orders`: neue Spalte `delivery_unconfirmed boolean not null default false`.
- Index `orders_unconfirmed_idx` auf `(delivery_unconfirmed)` where true.
- Neue SECURITY-DEFINER-RPC `admin_resolve_undelivered_order(_order_id uuid, _action text)`:
  - `_action = 'retry'`: setzt `status = 'neu'`, `delivery_unconfirmed = false`, `delivered_at = null`, schreibt History-Eintrag „Erneut zur Zustellung freigegeben".
  - `_action = 'final'`: setzt `delivery_unconfirmed = false`, History-Eintrag „Endgültig nicht zugestellt bestätigt".
  - Nur Admin (über `has_role`).

### Edge Function `driver-update-stop-status`

- Block ab Zeile ~189: Bei `status = 'uebersprungen'` immer:
  - `newOrderStatus = 'nicht_zugestellt'`
  - `delivery_attempts = (alt) + 1`
  - `delivery_unconfirmed = true`
  - History-Eintrag „Versuch X fehlgeschlagen – wartet auf Admin-Freigabe"
- Push an Admins: Titel „Auftrag X: Zustellversuch X fehlgeschlagen, Freigabe erforderlich".
- `MAX_DELIVERY_ATTEMPTS`-Verzweigung (retry vs. final) entfernt.

### Frontend

- `src/types/order.ts`: Feld `deliveryUnconfirmed: boolean`; `MAX_DELIVERY_ATTEMPTS`-Konstante darf bleiben (rein informativ in der UI).
- `src/stores/orderStore.ts`: Spalte mappen.
- `src/components/admin/dashboard/ObstacleOrdersCard.tsx`:
  - Query erweitern: `status = 'nicht_zugestellt' AND delivery_unconfirmed = true`.
  - Zwei kleine Buttons pro Zeile: „Erneut zustellen" / „Endgültig". Aufruf der RPC, danach Reload + Toast.
  - Badge „Bestätigung ausstehend".
- `src/components/dashboard/OrderDetailSheet.tsx` (Admin-View):
  - Bei `order.deliveryUnconfirmed` Hinweisbox mit denselben zwei Aktionsbuttons.
- `src/pages/admin/AdminDashboardPage.tsx`: kein größerer Umbau, nur Realtime-Refresh nach Aktion (vorhanden).

### Migration für Bestand

Vorhandene Aufträge mit `status = 'nicht_zugestellt'` werden im Rahmen der Migration als bereits bestätigt behandelt (`delivery_unconfirmed = false`) — sonst tauchen alte Fälle plötzlich wieder auf.

## Offen für Implementierung (Standardannahmen)

- Kein neuer Status, weiterhin `nicht_zugestellt` + Flag (so vom Nutzer gewählt).
- Keine Händler-Mitsprache in dieser Iteration; nur Admin entscheidet.
- Push-Benachrichtigung an Admins bleibt bestehen, Text wird angepasst.
