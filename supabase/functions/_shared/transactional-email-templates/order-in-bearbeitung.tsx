import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, tagline, h1, text, card, cardLabel, cardValue, infoBox, infoLabel, infoValue, footer } from './_styles.ts'

interface Props {
  kundenname?: string
  haendlerName?: string
  auftragsNr?: string
  lieferadresse?: string
}

const Email = ({ kundenname, haendlerName, auftragsNr, lieferadresse }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>Ihre Bestellung wird vorbereitet</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
        <Heading style={h1}>Guten Tag{kundenname ? ` ${kundenname}` : ''},</Heading>
        <Text style={text}>
          Ihre Bestellung von <strong>{haendlerName ?? 'unserem Händler'}</strong> wird gerade bei uns vorbereitet und in Kürze auf den Weg zu Ihnen gebracht. Die Zustellung erfolgt voraussichtlich noch heute oder am nächsten Werktag.
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
        <Text style={text}>Sie erhalten eine weitere Nachricht, sobald unser Fahrer mit Ihrer Bestellung unterwegs ist.</Text>
        <Text style={footer}>e-cargo · Klimafreundliche Lieferungen direkt zu Ihnen.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Ihre Bestellung wird vorbereitet',
  displayName: 'Bestellung – In Bearbeitung',
  previewData: { kundenname: 'Max Mustermann', haendlerName: 'PMF Store', auftragsNr: 'EC-PMF-0000123', lieferadresse: 'Musterstraße 1, 12345 Berlin' },
} satisfies TemplateEntry