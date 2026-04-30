import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, tagline, h1, text, card, cardLabel, cardValue, infoBox, infoLabel, infoValue, footer, ctaWrap, ctaButton, ctaHint } from './_styles.ts'
import { pick, type OverrideShape } from './_override.ts'

interface Props {
  kundenname?: string
  haendlerName?: string
  auftragsNr?: string
  lieferadresse?: string
  trackingUrl?: string
  __override?: OverrideShape
}

const Email = ({ kundenname, haendlerName, auftragsNr, lieferadresse, trackingUrl, __override: o }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>{pick(o?.preview, 'Ihre Bestellung wird vorbereitet', 'preview'))}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
        <Heading style={h1}>{pick(o?.greeting, `Guten Tag${kundenname ? ` ${kundenname}` : ''},`, 'greeting'))}</Heading>
        <Text style={text}>{pick(o?.intro, `Ihre Bestellung von ${haendlerName ?? 'unserem Händler'} wird gerade bei uns vorbereitet und in Kürze auf den Weg zu Ihnen gebracht. Die Zustellung erfolgt voraussichtlich noch heute oder am nächsten Werktag.`, 'intro'))}</Text>
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
            <Button href={trackingUrl} style={ctaButton}>{pick(o?.ctaLabel, 'Sendung verfolgen & Anweisungen hinterlassen', 'ctaLabel'))}</Button>
            <Text style={ctaHint}>Zur Verifizierung wird Ihre Postleitzahl abgefragt.</Text>
          </div>
        ) : null}
        <Text style={text}>{pick(o?.outro, 'Sie erhalten eine weitere Nachricht, sobald unser Fahrer mit Ihrer Bestellung unterwegs ist.', 'outro'))}</Text>
        <Text style={footer}>{pick(o?.footer, 'e-cargo · Klimafreundliche Lieferungen direkt zu Ihnen.', 'footer'))}</Text>
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