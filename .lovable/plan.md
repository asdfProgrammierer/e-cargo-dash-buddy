## Ziel
In der Routenplanung (Stop-Liste der Route) zusätzlich die Straße/Hausnummer des Empfängers anzeigen.

## Änderung
**Datei:** `src/components/admin/RouteBuilder.tsx` (Zeile ~149–151, Stop-Zeile in der Routenliste)

Aktuell:
```
EC-0000123 · 44137 Dortmund
```

Neu (zwei Zeilen, damit nichts abgeschnitten wird):
```
EC-0000123
Musterstraße 12 · 44137 Dortmund
```

Konkret: die bestehende eine Zeile aufteilen — `auftrags_nr` bleibt als Caption, und darunter eine neue Caption-Zeile mit `empfaenger_adresse · empfaenger_plz empfaenger_stadt` (mit `truncate`, damit das Layout nicht bricht). Wenn `empfaenger_adresse` leer ist, nur PLZ/Stadt zeigen.

Die Daten (`empfaenger_adresse`) werden bereits aus der Datenbank geladen (Zeile 219), es ist also kein Query-Change nötig.

## Nicht geändert
- Keine Backend-/RLS-Änderungen.
- Keine Anpassung der PDF (zeigt die Adresse bereits).
- Keine Änderung am Sucheingang (sucht bereits in Adresse).