
## Ziel
Im Excel-Import soll man zwischen zwei Vorlagen wählen können:
- **Standard** (bisheriges Format der e-cargo-Vorlage)
- **Großkunde** (Format der hochgeladenen Datei `Auszuliefernde Sendungen …xlsx`)

Erkanntes Spaltenformat des Großkunden:

| Datum | Postleitzahl | Ort | Straße | Kunde | Filiale | Lieferung |
|-------|--------------|-----|--------|-------|---------|-----------|

Mapping in unsere Felder:
- `Kunde` → Empfänger Name
- `Straße` → Empfänger Straße
- `Postleitzahl` → PLZ
- `Ort` → Stadt
- `Lieferung` → Notiz (z. B. „Lieferung 5220266730")
- `Filiale` → wird der Notiz angehängt (z. B. „Filiale 5304")
- `Datum` → ignoriert (wird nicht benötigt, Erstelldatum kommt vom System)
- Pakete = 1, Gewicht = 0 (Default, kann in der Vorschau editiert werden)

## Änderungen

### 1. `src/components/dashboard/ExcelImport.tsx`
- Neuen State `template: "standard" | "grosskunde"` einführen.
- Oberhalb der Upload-Zone ein `Select` „Vorlage" einbauen mit den zwei Optionen.
- Den Parsing-Block in `handleFile` so umbauen, dass je nach gewählter Vorlage eine andere Mapping-Funktion läuft:
  - **standard**: bestehende `COLUMN_MAP`-Logik unverändert.
  - **grosskunde**: feste Spaltenzuordnung anhand der Header `Kunde`, `Straße`, `Postleitzahl`, `Ort`, `Lieferung`, `Filiale` (case-insensitive, Umlaute toleriert). Erzeugt eine `PreviewRow` mit kombinierter Notiz.
- Karte „Erwartete Spalten" zeigt die Spaltenliste der jeweils aktiven Vorlage an.
- Button „Vorlage herunterladen" liefert je nach Auswahl die passende Beispiel-Datei.

### 2. Keine Backend-Änderungen
Der Insert-Pfad in `AdminExcelImportDialog.tsx` und der eigenen `ImportPage` bleibt identisch, da nur das Frontend-Parsing erweitert wird. Geocoding und Status-Mails laufen wie bisher.

### 3. Labeling
Die zweite Vorlage wird neutral „Großkunde (Filiale/Lieferung)" benannt, damit kein konkreter Kundenname im UI auftaucht. Falls du einen Namen möchtest, sag kurz Bescheid – das ist eine 1-Zeilen-Anpassung.

## Technische Details
- Header-Erkennung über `normalize(str) = str.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').trim()`.
- Datumsspalte wird ignoriert, damit Excel-Datumswerte keine Probleme machen.
- Validierung (Empfänger Name + Stadt Pflicht) und Vorschau/Editier-UI bleiben unverändert für beide Vorlagen.
