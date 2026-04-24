import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, tagline, h1, text, card, cardLabel, cardValue, infoBox, infoLabel, infoValue, warnCard, warnLabel, footer, ctaWrap, ctaButton, ctaHint } from './_styles.ts'

interface Props {
  kundenname?: string
  haendlerName?: string
  auftragsNr?: string
  lieferadresse?: string
  reason?: string
  trackingUrl?: string
}

const Email = ({ kundenname, haendlerName, auftragsNr, lieferadresse, reason, trackingUrl }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>Ihre Bestellung konnte heute nicht zugestellt werden</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
        <Heading style={h1}>Guten Tag{kundenname ? ` ${kundenname}` : ''},</Heading>
        <Text style={text}>
          leider konnten wir Ihre Bestellung von <strong>{haendlerName ?? 'unserem Händler'}</strong> heute nicht an Sie zustellen.
        </Text>
        {reason ? (
          <div style={warnCard}>
            <Text style={warnLabel}>Grund</Text>
            <Text style={cardValue}>{reason}</Text>
          </div>
        ) : null}
        {auftragsNr ? (
          <div style={card}>
            <Text style={cardLabel}>Auftragsnummer</Text>
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
            <Button href={trackingUrl} style={ctaButton}>Sendung verfolgen</Button>
            <Text style={ctaHint}>Zur Verifizierung wird Ihre Postleitzahl abgefragt.</Text>
          </div>
        ) : null}
        <Text style={text}>Wir setzen uns in Kürze mit Ihnen oder Ihrem Händler in Verbindung, um einen erneuten Zustellversuch abzustimmen.</Text>
        <Text style={footer}>e-cargo · Klimafreundliche Lieferungen direkt zu Ihnen.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Zustellung Ihrer Bestellung war nicht möglich',
  displayName: 'Bestellung – Nicht Zugestellt',
  previewData: { kundenname: 'Max Mustermann', haendlerName: 'PMF Store', auftragsNr: 'EC-PMF-0000123', lieferadresse: 'Musterstraße 1, 12345 Berlin', reason: 'Empfänger nicht angetroffen' },
} satisfies TemplateEntry