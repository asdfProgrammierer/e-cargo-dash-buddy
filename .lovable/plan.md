
Ziel: Händler sollen beim Erfassen von Aufträgen einen dezenten Hinweis sehen, wenn die Empfänger-PLZ außerhalb des e-cargo-Liefergebiets liegt. Der Auftrag soll trotzdem weiterhin gespeichert bzw. importiert werden können.

## Was umgesetzt wird

### 1. Liefergebiets-Prüfung für Händler einbauen
Die bestehende PLZ-/Zonenlogik wird für die Händlerseite nur noch als Hinweis verwendet, nicht als operative Zonenanzeige.

- Prüfung anhand der vorhandenen `delivery_zone_postcodes`
- nur für gültige 5-stellige PLZ
- Ergebnis:
  - PLZ liegt im Liefergebiet: kein Hinweis nötig
  - PLZ liegt nicht im Liefergebiet: Hinweis anzeigen
  - leere/ungültige PLZ: kein Liefergebietshinweis, nur normales Formularverhalten

### 2. Hinweis im Dialog „Neuer Auftrag“
In `CreateOrderDialog` wird direkt unter dem PLZ-/Empfängerbereich ein kleiner, unaufdringlicher Hinweis ergänzt:

Text:
„Diese Postleitzahl liegt außerhalb des Liefergebietes von e-cargo.“

Wichtig:
- rein informativ
- kein Fehlerzustand
- kein Blockieren des Submit
- visuell eher als neutrale/warnende Info, nicht als harte Fehlermeldung

### 3. Verhalten für Sonderaufträge beibehalten
Die Auftragserstellung bleibt unverändert möglich.

- Speichern trotz Hinweis weiterhin erlaubt
- kein Zwang zur Änderung der PLZ
- keine Admin-Funktionalität auf der Händlerseite sichtbar machen

### 4. Excel-/CSV-Import ebenfalls berücksichtigen
Da Händler auch per Datei importieren können, wird derselbe Hinweisgedanke dort ergänzt.

Geplantes Verhalten:
- Zeilen mit PLZ außerhalb des Liefergebiets werden nicht verworfen
- betroffene Zeilen werden in der Vorschau markiert oder mit kleinem Hinweis versehen
- Import bleibt weiterhin möglich

So bleibt das Verhalten konsistent zwischen manueller Erfassung und Sammelimport.

### 5. Zonen auf Händlerseite bewusst ausblenden
Die Zone ist laut Anforderung intern für euch relevant, nicht für Händler.

Deshalb:
- keine Zonenausgabe im Händler-Erfassungsdialog
- kein Fokus auf Zonenlabels im Händlerfluss
- interne Zonenlogik bleibt für Admin, Disposition und Etiketten erhalten

## Betroffene Bereiche

- `src/components/dashboard/CreateOrderDialog.tsx`
- `src/components/dashboard/ExcelImport.tsx`
- optional kleine gemeinsame Hilfsfunktion in `src/lib/` für Liefergebiets-Check, damit Dialog und Import dieselbe Logik nutzen

## Technische Details

### Datenquelle
Verwendung der bestehenden Tabellen:
- `delivery_zones`
- `delivery_zone_postcodes`

Es ist keine neue Datenbankstruktur nötig.

### UX-Regel
```text
Wenn Empfänger-PLZ vorhanden und 5-stellig:
  prüfen, ob postcode in delivery_zone_postcodes existiert
  wenn nein:
    Hinweis anzeigen
  wenn ja:
    kein Hinweis
```

### Warum so
- passt zu eurem Geschäftsmodell mit regulärem Liefergebiet plus Sonderaufträgen
- Händler werden informiert, aber nicht ausgebremst
- Admin-/Sortierlogik bleibt intern
- keine unnötige Komplexität in der Händleransicht

## Ergebnis
Händler sehen künftig sofort, wenn eine Sendung außerhalb des normalen Liefergebiets liegt, können den Auftrag aber trotzdem ohne Umwege anlegen oder importieren. Damit bleibt der Flow einfach, während ihr intern weiterhin sauber mit Lieferzonen arbeiten könnt.
