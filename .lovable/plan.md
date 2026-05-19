## Ziel

Auf der statischen Marketing-Webseite (`ecargo-logistik.de`) das vorhandene „Sendung verfolgen"-Modal funktionsfähig machen und den Kunden-Login-Link auf das neue Dashboard umstellen.

## Hintergrund

In der Lovable-App werden Tracking-Links über einen geheimen Token gebaut: `ecargo-connect.ecargo-logistik.de/track/<token>`. Der Token steht nur in der Versand-E-Mail. Auf der Webseite gibt der Kunde aber die **Auftragsnummer** ein (z. B. `EC-EIS-0000039`). Es muss also eine kleine öffentliche Lookup-Schnittstelle her, die Auftragsnummer + Empfänger-PLZ entgegennimmt und – wenn beides passt – den passenden Tracking-Token zurückgibt. Die Webseite leitet den Browser dann auf die bestehende Tracking-Seite weiter.

PLZ als zweiter Faktor verhindert, dass jemand durch Raten der Auftragsnummer fremde Sendungen einsehen kann.

## Was wir bauen

### 1. Neue öffentliche Edge Function `public-tracking-lookup`

- Nimmt per `POST` JSON entgegen: `{ auftrags_nr, plz }`
- Validiert Format (Auftragsnr. Regex `^EC-[A-Z0-9]+-P?\d{7}$`, PLZ 5-stellig)
- Rate-Limit: max. ~10 Versuche pro IP / 10 Min (gegen Brute-Force)
- Sucht in `orders` per Service-Role nach passender Zeile mit identischer (getrimmter, normalisierter) PLZ
- Antwort bei Treffer: `{ url: "https://ecargo-connect.ecargo-logistik.de/track/<token>" }`
- Antwort bei Fehler: einheitlich `404 { error: "Sendung nicht gefunden" }` (egal ob Nr. falsch oder PLZ falsch — keine Hinweise für Angreifer)
- `verify_jwt = false`, CORS erlaubt `https://ecargo-logistik.de` und `https://www.ecargo-logistik.de`

### 2. Anpassungen auf der Marketing-Webseite (`index.html` + `js/tracking.js`)

- Modal um ein zweites Feld **„PLZ Empfänger"** ergänzen, Placeholder z. B. `44789`
- Hinweistext: „Sie finden die Auftragsnummer in Ihrer Versandbestätigung (Format `EC-XXX-0000000`)."
- `js/tracking.js` ruft die neue Edge Function via `fetch(...)` auf und macht bei Erfolg `window.location.href = data.url`
- Bei Fehler: freundliche Meldung im Modal („Wir konnten zu dieser Auftragsnummer und PLZ keine Sendung finden. Bitte prüfen Sie Ihre Eingaben oder nutzen Sie den Tracking-Link aus Ihrer E-Mail.")
- Der alte „Sendungsstatus-Inline-Block" im Modal kann entfernt werden, da wir auf die App-Tracking-Seite weiterleiten

### 3. Dashboard-Link im Header ersetzen

- `https://ecargo-logistic.de/dashboard` → `https://ecargo-connect.ecargo-logistik.de`

## Was bleibt unverändert

- Bestehende `/track/:token`-Route in der App (volle Tracking-Seite mit Karte, ETA, Lieferanweisungen)
- Tracking-Token-Generierung (DB-Trigger `generate_tracking_token`)
- Versand-E-Mails (enthalten weiterhin den Token-Direktlink)

## Technische Details

**Edge Function Pseudo-Code:**
```ts
const { auftrags_nr, plz } = await req.json();
// Validierung mit zod
const { data } = await supabaseAdmin
  .from("orders")
  .select("tracking_token, empfaenger_plz")
  .eq("auftrags_nr", auftrags_nr.toUpperCase().trim())
  .maybeSingle();
if (!data || data.empfaenger_plz?.trim() !== plz.trim()) {
  return new Response(JSON.stringify({ error: "Sendung nicht gefunden" }), { status: 404, ... });
}
return new Response(JSON.stringify({
  url: `https://ecargo-connect.ecargo-logistik.de/track/${data.tracking_token}`
}), { status: 200, ... });
```

**Rate-Limit:** in-memory Map pro Function-Instanz reicht für die Brute-Force-Bremse; bei Bedarf später auf KV/DB heben.

## Was du als Nächstes tun musst

1. Plan freigeben → ich deploye die Edge Function `public-tracking-lookup` in die Lovable-App.
2. Du bekommst von mir die fertigen Code-Snippets für `index.html` (Modal mit 2. Feld + Dashboard-Link) und `js/tracking.js` (fetch + Redirect) zum Einbauen auf der Marketing-Webseite. Die statische Seite liegt nicht in diesem Lovable-Projekt, deshalb kann ich sie nicht direkt deployen — nur die Snippets liefern.
