import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, tagline, h1, text, card, cardLabel, cardValue, infoBox, infoLabel, infoValue, warnCard, warnLabel, footer, ctaWrap, ctaButton, ctaHint } from './_styles.ts'
import { pick, pickText, type OverrideShape } from './_override.ts'

interface Props {
  kundenname?: string
  haendlerName?: string
  auftragsNr?: string
  lieferadresse?: string
  reason?: string
  trackingUrl?: string
  __override?: OverrideShape
}

const Email = ({ kundenname, haendlerName, auftragsNr, lieferadresse, reason, trackingUrl, __override: o }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>{pickText(o?.preview, 'Ihre Bestellung konnte heute nicht zugestellt werden')}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
        <Heading style={h1}>{pick(o?.greeting, `Guten Tag${kundenname ? ` ${kundenname}` : ''},`, 'greeting')}</Heading>
        <Text style={text}>{pick(o?.intro, `leider konnten wir Ihre Bestellung von ${haendlerName ?? 'unserem Händler'} heute nicht an Sie zustellen.`, 'intro')}</Text>
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
            <Button href={trackingUrl} style={ctaButton}>{pick(o?.ctaLabel, 'Sendung verfolgen', 'ctaLabel')}</Button>
            <Text style={ctaHint}>Zur Verifizierung wird Ihre Postleitzahl abgefragt.</Text>
          </div>
        ) : null}
        <Text style={text}>{pick(o?.outro, 'Wir setzen uns in Kürze mit Ihnen oder Ihrem Händler in Verbindung, um einen erneuten Zustellversuch abzustimmen.', 'outro')}</Text>
        <Text style={footer}>{pick(o?.footer, 'e-cargo · Klimafreundliche Lieferungen direkt zu Ihnen.', 'footer')}</Text>
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