import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, tagline, h1, text, card, cardLabel, cardValue, infoBox, infoLabel, infoValue, footer, ctaWrap, ctaButton, ctaHint } from './_styles.ts'

interface Props {
  kundenname?: string
  haendlerName?: string
  auftragsNr?: string
  lieferadresse?: string
  trackingUrl?: string
}

const Email = ({ kundenname, haendlerName, auftragsNr, lieferadresse, trackingUrl }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>Ihre Bestellung bei {haendlerName ?? 'uns'} wurde übermittelt</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
        <Heading style={h1}>Guten Tag{kundenname ? ` ${kundenname}` : ''},</Heading>
        <Text style={text}>
          Ihre Bestellung bei <strong>{haendlerName ?? 'unserem Händler'}</strong> wurde an uns übermittelt. Wir liefern Ihre Bestellung umweltfreundlich und emissionsfrei an Sie aus.
        </Text>
        {auftragsNr ? (
          <div style={card}>
            <Text style={cardLabel}>Ihre Auftragsnummer</Text>
            <Text style={cardValue}>{auftragsNr}</Text>
          </div>
        ) : null}
        {lieferadresse ? (
          <div style={infoBox}>
            <Text style={infoLabel}>Lieferadresse</Text>
            <Text style={infoValue}>{lieferadresse}</Text>
          </div>
        ) : null}
        {trackingUrl ? (
          <div style={ctaWrap}>
            <Button href={trackingUrl} style={ctaButton}>Sendung verfolgen & Anweisungen hinterlassen</Button>
            <Text style={ctaHint}>Zur Verifizierung wird Ihre Postleitzahl abgefragt.</Text>
          </div>
        ) : null}
        <Text style={text}>Sobald Ihre Bestellung in Bearbeitung geht, erhalten Sie eine weitere Nachricht von uns.</Text>
        <Text style={footer}>e-cargo · Klimafreundliche Lieferungen direkt zu Ihnen.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Bestellung bei ${d.haendlerName ?? 'uns'} eingegangen`,
  displayName: 'Bestellung – Neu',
  previewData: { kundenname: 'Max Mustermann', haendlerName: 'PMF Store', auftragsNr: 'EC-PMF-0000123', lieferadresse: 'Musterstraße 1, 12345 Berlin' },
} satisfies TemplateEntry