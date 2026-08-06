# Eigene WMS-API-Keys pro Händler

Heute prüft die WMS-Schnittstelle (`wms-create-shipment`) genau einen globalen Schlüssel (`WMS_API_KEY`), und der Händler wird nur über den mitgeschickten 3-stelligen Händlercode bestimmt. Künftig soll jeder Händler seinen eigenen Schlüssel bekommen, der fest an seinen Händlercode gebunden ist.

## Was entsteht

- Pro Händler können in der Händlerverwaltung ein oder mehrere API-Keys erzeugt werden.
- Der Schlüssel wird genau einmal im Klartext angezeigt (zum Kopieren), danach nur noch als Vorschau (`wms_live_ab12…`), da nur ein Hash gespeichert wird.
- Jeder Key gehört zu genau einem Händler. Der Händlercode wird daraus abgeleitet — das WMS-Programm muss ihn nicht mehr mitsenden (darf es aber; dann muss er passen, sonst Fehler).
- Keys können deaktiviert/gelöscht werden; letzte Nutzung wird angezeigt.
- Der bisherige globale Schlüssel bleibt als Fallback gültig (dann weiterhin mit Händlercode im Payload), damit bestehende Anbindungen nicht brechen.

## Ablauf in der Admin-Oberfläche

Auf der Händler-Detailseite kommt ein neuer Abschnitt „WMS-API-Zugang":

```text
WMS-API-Zugang
  Händlercode: MAY
  Endpoint:    .../wms-create-shipment

  [ Neuen API-Key erzeugen ]

  Bezeichnung        Key            Erstellt     Zuletzt genutzt   Status
  Lagerprogramm      wms_live_ab12… 06.08.2026   heute 08:12       Aktiv  [Deaktivieren] [Löschen]
```

Voraussetzung: Der Händler muss einen Händlercode haben; sonst Hinweis statt Button.

## Technische Umsetzung

**Datenbank** (Migration)
- Neue Tabelle `public.wms_api_keys`: `id`, `user_id`, `merchant_code`, `label`, `key_hash` (SHA-256, unique), `key_prefix`, `active`, `last_used_at`, `created_at`, `created_by`.
- GRANTs: `authenticated` (SELECT/INSERT/UPDATE/DELETE) + `service_role` ALL; RLS an; Policies ausschließlich `has_role(auth.uid(),'admin')`. Kein `anon`. Klartext-Key wird nie gespeichert.
- Index auf `key_hash`.

**Key-Erzeugung**
- Neue Edge Function `admin-create-wms-key`: prüft Admin-Rolle, erzeugt 32-Byte-Zufallsschlüssel (`wms_live_<base64url>`), speichert Hash + Prefix, gibt den Klartext einmalig zurück.

**Auth in `wms-create-shipment`**
- Eingehenden Header `x-wms-api-key` hashen und in `wms_api_keys` (aktiv) suchen.
- Treffer → Händler aus dem Key; `merchant_reference` im Payload wird optional, bei Abweichung `UNAUTHORIZED`. `last_used_at` aktualisieren.
- Kein Treffer → Vergleich mit globalem `WMS_API_KEY` (bisheriges Verhalten, `merchant_reference` weiter Pflicht).
- Sonst `UNAUTHORIZED`.

**Doku**
- `wms-api-spezifikation.md` um den händlerspezifischen Key und das optionale `merchant_reference` ergänzen.
