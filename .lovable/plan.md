## Ziel
Beim Anlegen von Aufträgen für interne/virtuelle Händler soll der Admin auf ein Adressbuch pro Händler zugreifen können — Empfänger schnell wiederverwenden statt jedes Mal neu eintippen.

## Hintergrund
Die Tabelle `address_book` existiert bereits und wird im Händler-Dashboard genutzt (Favoriten, Inline-Speichern). Sie ist pro `user_id` (Händler-Owner) gescoped. Virtuelle Händler haben aber keinen Login — daher kommt aktuell niemand an deren Adressbuch ran. Admins können momentan im `AdminCreateOrderDialog` weder lesen noch speichern.

## Umfang
1. **RLS:** Admins dürfen `address_book` aller Händler lesen/schreiben/löschen (4 neue Policies via `has_role(auth.uid(),'admin')`).
2. **Admin-Dialog (`AdminCreateOrderDialog`):**
   - Nach Auswahl eines Händlers werden dessen Adressbuch-Einträge geladen.
   - Neues Combobox-Feld „Empfänger aus Adressbuch wählen" (suchbar, Favoriten oben). Auswahl füllt Name, Straße, PLZ, Stadt, E-Mail, Telefon automatisch.
   - Checkbox „In Adressbuch speichern" (default an für neue Adressen). Beim Submit wird der Empfänger via Upsert (Match auf `user_id` + normalisierte Adresse) in `address_book` gespeichert.
   - Stern-Icon neben der Combobox, um Eintrag als Favorit zu markieren.
3. **Optional sichtbarer Einstiegspunkt:** Auf der `HaendlerDetailPage` (Detailseite eines virtuellen Händlers) eine kleine Karte „Adressbuch (X Einträge)" mit Link/Aktion „Verwalten" — verwendet eine schlanke Verwaltungsansicht (Liste + Löschen + Favorit-Toggle). Falls außerhalb des Scopes gewünscht, kann das in einem späteren Schritt erfolgen.

## Technische Details
- Neue Migration: SELECT/INSERT/UPDATE/DELETE-Policies auf `public.address_book` mit `has_role(auth.uid(),'admin')`.
- `AdminCreateOrderDialog`: Adressbuch-Query `select * from address_book where user_id = effectiveMerchantId order by is_favorite desc, firma_name`. Verwendung der bestehenden `Command`/`Popover`-Komponenten für die Combobox (analog zum Merchant-Picker im Händler-Dashboard, falls vorhanden) oder ein einfacher Select mit Suche.
- Upsert-Logik beim Anlegen: Wenn die ausgewählte Adresse aus dem Adressbuch stammt, kein Insert. Wenn der Admin eine neue Adresse eingegeben und die Checkbox aktiv ist, wird ein neuer Adressbuch-Eintrag angelegt.
- Keine Änderungen am bestehenden Händler-Dashboard-Adressbuch nötig.

## Nicht im Umfang
- Keine Änderung an Order-Erstellung von Händlern selbst (funktioniert bereits).
- Keine Bulk-Import-Funktion für Adressbuch im Admin (kann später kommen).
