import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, tagline, h1, text, card, cardLabel, cardValue, warnCard, warnLabel, footer } from './_styles.ts'
import { pick, pickText, type OverrideShape } from './_override.ts'

interface Props {
  kundenname?: string
  haendlerName?: string
  auftragsNr?: string
  lieferadresse?: string
  __override?: OverrideShape
}

const Email = ({ kundenname, haendlerName, auftragsNr, lieferadresse, __override: o }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>{pickText(o?.preview, 'Ihre Lieferung verzögert sich – wir bitten um Entschuldigung')}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
        <Heading style={h1}>{pick(o?.greeting, `Guten Tag${kundenname ? ` ${kundenname}` : ''},`, 'greeting')}</Heading>
        <Text style={text}>
          {pick(
            o?.intro,
            `es tut uns sehr leid: Ihre Sendung von ${haendlerName ?? 'unserem Händler'} kann heute leider nicht mehr zugestellt werden. Unsere Tour musste aus einem unvorhergesehenen Grund vorzeitig beendet werden.`,
            'intro',
          )}
        </Text>
        <div style={warnCard}>
          <Text style={warnLabel}>Was passiert jetzt?</Text>
          <Text style={cardValue}>
            Wir entschuldigen uns aufrichtig und planen Ihr Paket für die nächstmögliche Tagestour fest ein.
          </Text>
        </div>
        {auftragsNr ? (
          <div style={card}>
            <Text style={cardLabel}>Auftragsnummer</Text>
            <Text style={cardValue}>{auftragsNr}</Text>
          </div>
        ) : null}
        {lieferadresse ? (
          <div style={card}>
            <Text style={cardLabel}>Lieferadresse</Text>
            <Text style={cardValue}>{lieferadresse}</Text>
          </div>
        ) : null}
        <Text style={text}>{pick(o?.outro, 'Vielen Dank für Ihr Verständnis.', 'outro')}</Text>
        <Text style={footer}>{pickText(o?.footer, 'e-cargo – nachhaltige Logistik im Ruhrgebiet')}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Ihre Lieferung verzögert sich – es tut uns leid',
  displayName: 'Tour abgebrochen (Paket kommt später)',
  previewData: {
    kundenname: 'Anna Beispiel',
    haendlerName: 'Muster GmbH',
    auftragsNr: 'EC-0000123',
    lieferadresse: 'Anna Beispiel, Hauptstr. 1, 45127 Essen',
  },
} satisfies TemplateEntry
