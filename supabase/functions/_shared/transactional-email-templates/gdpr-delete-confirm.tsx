import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, tagline, h1, text, card, cardLabel, cardValue, warnCard, warnLabel, footer, ctaWrap, ctaButton, ctaHint } from './_styles.ts'

interface Props {
  auftragsNr?: string
  confirmUrl?: string
  expiresHours?: number
}

const Email = ({ auftragsNr, confirmUrl, expiresHours }: Props) => (
  <Html lang="de">
    <Head />
    <Preview>Bestätigen Sie die Löschung Ihrer Daten zu Auftrag {auftragsNr ?? ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo</Text>
        <Text style={tagline}>Datenschutz-Selbstbedienung</Text>
        <Heading style={h1}>Löschung Ihrer Daten bestätigen</Heading>
        <Text style={text}>
          Sie haben angefragt, dass wir Ihre personenbezogenen Daten zu folgendem Auftrag
          löschen sollen. Bitte bestätigen Sie diese Aktion, damit wir sicherstellen können,
          dass die Anfrage tatsächlich von Ihnen stammt.
        </Text>
        {auftragsNr ? (
          <div style={card}>
            <Text style={cardLabel}>Auftragsnummer</Text>
            <Text style={cardValue}>{auftragsNr}</Text>
          </div>
        ) : null}
        {confirmUrl ? (
          <div style={ctaWrap}>
            <Button href={confirmUrl} style={ctaButton}>Löschung jetzt bestätigen</Button>
            <Text style={ctaHint}>
              Der Link ist {expiresHours ?? 24} Stunden gültig und kann nur einmal verwendet werden.
            </Text>
          </div>
        ) : null}
        <div style={warnCard}>
          <Text style={warnLabel}>Was passiert nach der Bestätigung?</Text>
          <Text style={text}>
            Ihre Empfängerdaten (Name, Adresse, E-Mail, Telefon, Notizen, Unterschrift, Foto,
            Lieferschein) werden unwiderruflich anonymisiert. Auftragsnummer, PLZ, Status und
            Paketkennzahlen bleiben aus Nachweis- und Statistikgründen erhalten — sie lassen
            aber keine Rückschlüsse mehr auf Ihre Person zu.
          </Text>
        </div>
        <Text style={text}>
          Falls Sie diese E-Mail unerwartet erhalten haben, ignorieren Sie sie einfach – es
          wird nichts unternommen und der Link läuft automatisch ab.
        </Text>
        <Text style={footer}>e-cargo · Ihre Datenschutzanfrage nach DSGVO Art. 17.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Bestätigen Sie die Löschung Ihrer Daten (Auftrag ${d.auftragsNr ?? ''})`,
  displayName: 'DSGVO – Löschung bestätigen',
  previewData: { auftragsNr: 'EC-PMF-0000123', confirmUrl: 'https://example.com/gdpr/confirm-delete?token=…', expiresHours: 24 },
} satisfies TemplateEntry