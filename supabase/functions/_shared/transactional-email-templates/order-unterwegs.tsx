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
  etaWindow?: string
  etaCenter?: string
}

const Email = ({ kundenname, haendlerName, auftragsNr, lieferadresse, trackingUrl, etaWindow, etaCenter }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>Ihre Bestellung ist unterwegs zu Ihnen</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
        <Heading style={h1}>Guten Tag{kundenname ? ` ${kundenname}` : ''},</Heading>
        <Text style={text}>
          gute Nachrichten: Unser Fahrer ist mit Ihrer Bestellung von <strong>{haendlerName ?? 'unserem Händler'}</strong> unterwegs zu Ihnen. Voraussichtliche Zustellung noch heute.
        </Text>
        {auftragsNr ? (
          <div style={card}>
            <Text style={cardLabel}>Ihre Auftragsnummer</Text>
            <Text style={cardValue}>{auftragsNr}</Text>
          </div>
        ) : null}
        {etaWindow ? (
          <div style={infoBox}>
            <Text style={infoLabel}>
              {etaCenter ? 'Voraussichtliches Lieferzeitfenster (±30 Minuten)' : 'Voraussichtliches Lieferzeitfenster'}
            </Text>
            <Text style={infoValue}>{etaWindow}</Text>
            {etaCenter ? (
              <Text style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>
                Geplante Ankunft: ca. {etaCenter} Uhr
              </Text>
            ) : null}
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
        <Text style={text}>Bitte sorgen Sie dafür, dass jemand zur Annahme bereit ist. Wir freuen uns, Ihre Bestellung gleich klimaneutral bei Ihnen abzuliefern.</Text>
        <Text style={footer}>e-cargo · Klimafreundliche Lieferungen direkt zu Ihnen.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Ihre Bestellung ist unterwegs',
  displayName: 'Bestellung – Unterwegs',
  previewData: { kundenname: 'Max Mustermann', haendlerName: 'PMF Store', auftragsNr: 'EC-PMF-0000123', lieferadresse: 'Musterstraße 1, 12345 Berlin', etaWindow: '14:30 – 15:30 Uhr', etaCenter: '15:00' },
} satisfies TemplateEntry