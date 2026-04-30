import * as React from 'npm:react@18.3.1'

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

// Module-global editable flag, toggled by the admin preview function before render.
let EDITABLE = false
export function setEditable(value: boolean) {
  EDITABLE = value
}

export function pick(
  value: string | null | undefined,
  fallback: string,
  field?: string,
): React.ReactNode {
  const hasValue = typeof value === 'string' && value.trim().length > 0
  const display = hasValue ? (value as string) : fallback
  if (EDITABLE && field) {
    return React.createElement(
      'span',
      {
        'data-edit-field': field,
        'data-edit-empty': hasValue ? 'false' : 'true',
        style: { outline: 'none' },
      },
      display,
    )
  }
  return display
}

// Always returns a plain string. Use this for contexts that can't accept a
// React element child (e.g. <Preview> from @react-email which calls
// String.prototype.substr on its child).
export function pickText(
  value: string | null | undefined,
  fallback: string,
): string {
  const hasValue = typeof value === 'string' && value.trim().length > 0
  return hasValue ? (value as string) : fallback
}