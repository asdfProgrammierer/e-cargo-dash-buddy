export interface OverrideShape {
  subject?: string | null
  preview?: string | null
  greeting?: string | null
  intro?: string | null
  outro?: string | null
  ctaLabel?: string | null
  footer?: string | null
  enabled?: boolean
}

export function pick(value: string | null | undefined, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value
  return fallback
}

export function newlinesToBreaks(s: string): React.ReactNode[] {
  // not used; templates render plain text via <Text>; multiline allowed
  return []
}

import * as React from 'npm:react@18.3.1'