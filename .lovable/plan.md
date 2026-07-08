## Ziel

Aufträge nach 2 Monaten DSGVO-konform anonymisieren, ohne Statistiken (Volumen, CO₂, Heatmap nach PLZ) zu verlieren.

## Kurz zur PLZ-Frage

Die 5-stellige deutsche PLZ allein gilt in der Regel **nicht als personenbezogen**, solange sie nicht mit Name, Straße, E-Mail, Telefon oder einer Kunden-ID verknüpft ist. In einem urbanen PLZ-Gebiet leben tausende Menschen — Rückschluss auf eine Einzelperson ist ausgeschlossen. Nach Anonymisierung der übrigen Felder ist die PLZ also für Statistikzwecke unproblematisch.

Vorsicht wäre nur geboten bei sehr kleinen ländlichen PLZ + zusätzlichen quasi-identifizierenden Merkmalen (z. B. exaktes Zustelldatum + Gewicht + Paketanzahl kombiniert). Das Restrisiko ist bei uns gering, sollte aber vom DSB final abgesegnet werden.

## Was passiert nach 2 Monaten

Trigger: Auftrag ist älter als 2 Monate (Referenzdatum = `delivered_at` falls vorhanden, sonst `created_at`) **und** Status ist `zugestellt`, `nicht_zugestellt` oder `storniert` (offene Aufträge werden nie anonymisiert).

**Felder, die auf NULL / Platzhalter gesetzt werden:**
- `empfaenger_name` → `'anonymisiert'`
- `empfaenger_adresse` → `NULL` (Straße + Hausnr.)
- `empfaenger_stadt` → `NULL`
- `empfaenger_email` → `NULL`
- `empfaenger_telefon` → `NULL`
- `absender_name`, `absender_adresse` → `NULL` (nur bei Nicht-Abholungen; bei Abhol-Aufträgen ist das der Händler selbst = keine Kundendaten)
- `notizen` → `NULL`
- `lat`, `lng` → `NULL` (Punktkoordinate ist re-identifizierend)
- `dhl_label_url`, `tracking_token` → `NULL`
- Storage-Objekte in `delivery-signatures`, `delivery-notes`, `delivery-photos` für diese Auftrags-IDs löschen (läuft heute schon)

**Felder, die erhalten bleiben (für Statistik/Buchhaltung):**
- `id`, `user_id` (Händler), `auftrags_nr`
- `empfaenger_plz` ← bleibt für Heatmap
- `status`, `is_pickup`, `pakete`, `gewicht`, `delivery_attempts`
- `created_at`, `updated_at`, `delivered_at`
- Ein neues Flag `anonymized_at` (Zeitstempel), damit klar ist welche Zeilen bereits bereinigt sind und der Job sie nicht doppelt anfasst

## Umsetzung

1. **Migration:** Spalte `orders.anonymized_at timestamptz` hinzufügen (nullable).
2. **Migration:** Bestehende Funktion `gdpr_cleanup_personal_data()` erweitern um einen UPDATE-Block, der die o. g. Felder für qualifizierende Aufträge nullt und `anonymized_at = now()` setzt. `WHERE anonymized_at IS NULL AND status IN (...) AND COALESCE(delivered_at, created_at) < now() - interval '2 months'`.
3. **Migration:** Storage-Cleanup im gleichen Function-Body auf Objekte einschränken, deren Ordnername einer jetzt anonymisierten Order-ID entspricht (heute wird pauschal nach `created_at` in Storage gelöscht — das bleibt so, ist konsistent).
4. **admin_audit_log:** Retention hinzufügen — Einträge älter als 12 Monate löschen (Nachweispflicht vs. Datensparsamkeit; 12 Monate sind ein üblicher Kompromiss). Falls du eine andere Frist willst, sag Bescheid.
5. **Frontend:** Order-Tabellen/Details zeigen `'anonymisiert'` sauber an (kein UI-Bruch bei NULL-Feldern). Prüfen, wo `empfaenger_name` / `empfaenger_adresse` als non-null angenommen wird.
6. Keine Änderung am bestehenden Cron-Job — er ruft weiterhin `gdpr_cleanup_personal_data()` täglich um 03:15 UTC auf.

## Nicht Teil dieses Plans

- Härteres Löschen (statt Anonymisieren) — nicht gewünscht.
- Aufbewahrungsfristen für Rechnungen/Steuer (§ 147 AO). Auftragsdaten sind keine Rechnungen; falls du Rechnungs-PDFs erzeugst und speichern musst, wäre das separat zu regeln.

## Hinweis

Keine Rechtsberatung — die 2-Monats-Frist, das Behalten der PLZ und die Audit-Log-Retention sollte dein Datenschutzbeauftragter / Fachanwalt final bestätigen.
