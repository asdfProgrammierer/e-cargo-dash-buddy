import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, tagline, h1, text, card, cardLabel, cardValue, footer } from './_styles.ts'

interface Props {
  kundenname?: string
  haendlerName?: string
  auftragsNr?: string
}

const Email = ({ kundenname, haendlerName, auftragsNr }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>Ihre Bestellung wurde erfolgreich zugestellt</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
        <Heading style={h1}>Guten Tag{kundenname ? ` ${kundenname}` : ''},</Heading>
        <Text style={text}>
          Ihre Bestellung von <strong>{haendlerName ?? 'unserem Händler'}</strong> wurde erfolgreich an Sie zugestellt. Vielen Dank, dass Sie sich für eine umweltfreundliche und emissionsfreie Lieferung entschieden haben – Sie haben damit aktiv CO₂ eingespart.
        </Text>
        {auftragsNr ? (
          <div style={card}>
            <Text style={cardLabel}>Auftragsnummer</Text>
            <Text style={cardValue}>{auftragsNr}</Text>
          </div>
        ) : null}
        <Text style={text}>Wir wünschen Ihnen viel Freude mit Ihrer Bestellung.</Text>
        <Text style={footer}>e-cargo · Klimafreundliche Lieferungen direkt zu Ihnen.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Ihre Bestellung wurde zugestellt',
  displayName: 'Bestellung – Zugestellt',
  previewData: { kundenname: 'Max Mustermann', haendlerName: 'PMF Store', auftragsNr: 'EC-PMF-0000123' },
} satisfies TemplateEntry