import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Text, Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, brand, h1, text, card, cardLabel, cardValue, infoBox, infoLabel, infoValue } from './_styles.ts'

interface Props {
  auftragsNr?: string
  haendlerName?: string
  haendlerEmail?: string
  haendlerTelefon?: string
  nachricht?: string
  empfaenger?: string
  status?: string
  zustellung?: string
  adminUrl?: string
}

const Row = ({ label, value }: { label: string; value?: string }) =>
  value ? (<><Text style={infoLabel}>{label}</Text><Text style={infoValue}>{value}</Text></>) : null

const Email = (p: Props) => (
  <Html lang="de">
    <Head />
    <Preview>{`Händler-Nachfrage zu ${p.auftragsNr ?? 'einer Sendung'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>e-cargo Connect</Text>
        <Heading style={h1}>Neue Nachfrage zu {p.auftragsNr ?? 'einer Sendung'}</Heading>
        <div style={card}>
          <Text style={cardLabel}>Nachricht von {p.haendlerName ?? 'Händler'}</Text>
          <Text style={{ ...cardValue, whiteSpace: 'pre-wrap' as const }}>{p.nachricht ?? ''}</Text>
        </div>
        <div style={infoBox}>
          <Row label="Händler" value={p.haendlerName} />
          <Row label="E-Mail Händler" value={p.haendlerEmail} />
          <Row label="Telefon Händler" value={p.haendlerTelefon} />
          <Row label="Empfänger" value={p.empfaenger} />
          <Row label="Status" value={p.status} />
          <Row label="Zustellung" value={p.zustellung} />
        </div>
        {p.adminUrl ? <Text style={text}><Link href={p.adminUrl}>Auftrag im Admin-Portal öffnen</Link></Text> : null}
        <Text style={text}>Auf diese E-Mail antworten geht direkt an den Händler.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `[Nachfrage] ${d.auftragsNr ?? ''} – ${d.haendlerName ?? 'Händler'}`,
  displayName: 'Händler-Nachfrage zu Sendung (intern)',
  previewData: {
    auftragsNr: 'EC-POT-0000123', haendlerName: 'Potpourri GmbH', haendlerEmail: 'info@example.de',
    nachricht: 'Kunde sagt, das Paket ist nicht angekommen.', empfaenger: 'Anna Beispiel, Hauptstr. 1, 44787 Bochum',
    status: 'Zugestellt', zustellung: '27.10.2026 17:05 · Fahrer Martin · Carport',
  },
} satisfies TemplateEntry
