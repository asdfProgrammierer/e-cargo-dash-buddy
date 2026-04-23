
Ziel: Die Admin-Startseite soll zusätzlich eine zentrale Ansicht für neue Bestellungen aller Händler bekommen, damit du direkt im Dashboard siehst, was frisch reingekommen ist.

## Was ergänzt wird

### 1. Neue Sektion „Neue Bestellungen“
Auf der Admin-Startseite wird ein neuer Block eingebaut, z. B. unter den Kennzahlen oder im Bereich „Tagesgeschäft“:

- zeigt die neuesten Bestellungen aller Händler
- Fokus auf Status `neu`
- optional auch `in_bearbeitung`, falls du offene Eingänge breiter sehen willst
- sortiert nach `created_at` absteigend
- begrenzt auf eine kompakte Anzahl, z. B. 8–10 Einträge

### 2. Welche Infos pro Bestellung sichtbar sind
Jeder Eintrag soll direkt operativ nutzbar sein. Gezeigt werden:

- Auftragsnummer
- Händlername
- Empfängername
- Stadt
- Paketanzahl
- Erstellungsdatum/Uhrzeit
- Status-Badge

Da `orders` nur die `user_id` hat, wird der Händlername aus `profiles` geladen und per `user_id` zugeordnet.

### 3. Sinnvolle Admin-Sicht statt Händler-Sicht
Die bestehende Händler-Auftragsansicht ist auf den eingeloggten Händler beschränkt. Für das Admin-Dashboard wird deshalb eine eigene globale Abfrage verwendet:

- `orders` für alle neuen Bestellungen
- `profiles` für Händlernamen/Firmennamen
- clientseitiges Mapping `user_id -> firma_name / ansprechpartner`

So bleibt die Händlerlogik unberührt, und der Admin bekommt eine echte Gesamtübersicht.

### 4. Darstellung im Dashboard
Die neue Liste wird als kompakte Tabelle oder Kartenliste im bestehenden Admin-Stil eingebaut:

- gleiche Table-/Badge-/Card-Komponenten wie im Rest des Admin-Bereichs
- klarer Leerzustand: „Keine neuen Bestellungen“
- Ladezustand passend zu den anderen Dashboard-Blöcken
- responsive, damit es bei 1405px breit gut in das operative Layout passt

## Erweiterung des bestehenden Dashboard-Plans

Die Admin-Startseite besteht dann aus diesen operativen Blöcken:

1. Kennzahlen
   - Händler gesamt
   - Freigeschaltet
   - Ausstehend
   - Aufträge gesamt

2. Warnungen & Fälligkeiten
   - offene Freigaben
   - fällige Kontrollen
   - anstehender TÜV

3. Neue Bestellungen
   - neu eingegangene Aufträge aller Händler
   - mit Händlerbezug

4. Tagesgeschäft
   - heutige Routen
   - optional aktive Fahrer/Fahrzeuge

5. Schnellaktionen
   - Händlerverwaltung
   - Fahrzeugverwaltung
   - Routenplanung

## Technische Umsetzung

### Betroffene Datei
- `src/pages/admin/AdminDashboardPage.tsx`

### Geplante Datenlogik
- bestehende Statistikabfrage erweitern
- zusätzliche `orders`-Abfrage mit Fokus auf neue Aufträge
- zusätzliche `profiles`-Abfrage für Händlernamen
- Mapping von `orders.user_id` zu Profilinformationen
- optional kleine Hilfsfunktion für Datumsformatierung und Händler-Fallback

### Sicherheit
Es ist keine neue Datenbankstruktur nötig:
- Admins dürfen bereits alle `orders` lesen
- Admins dürfen bereits alle `profiles` lesen

Die vorhandenen Zugriffsregeln reichen daher für diese Erweiterung aus.

## Umsetzungsschritte
1. `AdminDashboardPage` um globale Bestellabfrage erweitern
2. Händlernamen aus `profiles` zuordnen
3. neue Dashboard-Sektion „Neue Bestellungen“ einbauen
4. Status-Badges und Datumsanzeige im bestehenden Stil ergänzen
5. Leerzustände und kompakte Darstellung finalisieren

## Ergebnis
Nach dem Ausbau sieht der Admin nicht nur Kennzahlen und Fälligkeiten, sondern auch sofort die neuesten Bestellungen aller Händler zentral auf der Startseite. Das Dashboard wird dadurch deutlich operativer und eignet sich besser als tägliche Leitstelle.
