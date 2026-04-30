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
  attemptNumber?: string | number
  nextAttemptNumber?: string | number
  __override?: OverrideShape
}

const Email = ({ kundenname, haendlerName, auftragsNr, lieferadresse, reason, trackingUrl, attemptNumber, nextAttemptNumber, __override: o }: Props) => {
  const attempt = String(attemptNumber ?? '1')
  const next = String(nextAttemptNumber ?? '2')
  return (
    <Html lang="de">
      <Head />
      <Preview>{pickText(o?.preview, `Ihr ${attempt}. Zustellversuch war leider nicht erfolgreich`)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>e-cargo</Text>
          <Text style={tagline}>Wir liefern 100% elektrisch.</Text>
          <Heading style={h1}>{pick(o?.greeting, `Guten Tag${kundenname ? ` ${kundenname}` : ''},`, 'greeting')}</Heading>
          <Text style={text}>{pick(o?.intro, `unser ${attempt}. Zustellversuch für Ihre Bestellung von ${haendlerName ?? 'unserem Händler'} war leider nicht erfolgreich. Keine Sorge: wir versuchen es kostenlos ein weiteres Mal (Versuch ${next} von 3). Sobald ein neuer Termin feststeht, informieren wir Sie automatisch.`, 'intro')}</Text>
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
              <Button href={trackingUrl} style={ctaButton}>{pick(o?.ctaLabel, 'Sendung verfolgen & Lieferanweisung geben', 'ctaLabel')}</Button>
              <Text style={ctaHint}>Tipp: Über den Tracking-Link können Sie uns Lieferanweisungen mitgeben (z. B. Nachbar, Briefkasten).</Text>
            </div>
          ) : null}
          <Text style={text}>{pick(o?.outro, 'Wir bemühen uns, Ihre Sendung beim nächsten Versuch erfolgreich zuzustellen.', 'outro')}</Text>
          <Text style={footer}>{pick(o?.footer, 'e-cargo · Klimafreundliche Lieferungen direkt zu Ihnen.', 'footer')}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `Zustellversuch ${data?.attemptNumber ?? '1'} von 3 nicht erfolgreich – wir versuchen es erneut`,
  displayName: 'Bestellung – Zustellversuch fehlgeschlagen',
  previewData: {
    kundenname: 'Max Mustermann',
    haendlerName: 'PMF Store',
    auftragsNr: 'EC-PMF-0000123',
    lieferadresse: 'Musterstraße 1, 12345 Berlin',
    reason: 'Empfänger nicht angetroffen',
    attemptNumber: 1,
    nextAttemptNumber: 2,
  },
} satisfies TemplateEntry
