import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface TemplateOverride {
  subject?: string | null
  preview?: string | null
  greeting?: string | null
  intro?: string | null
  outro?: string | null
  ctaLabel?: string | null
  footer?: string | null
  enabled?: boolean
}

let cachedClient: SupabaseClient | null = null

function getServiceClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  cachedClient = createClient(url, key)
  return cachedClient
}

function interpolate(value: string | null | undefined, data: Record<string, any>): string | undefined {
  if (!value) return undefined
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = data?.[k]
    return v === undefined || v === null ? '' : String(v)
  })
}

/**
 * Lädt das Override für ein Template und gibt es interpoliert (mit templateData) zurück.
 * Gibt null zurück, wenn kein Override existiert oder Lookup fehlschlägt.
 */
export async function loadTemplateOverride(
  templateName: string,
  data: Record<string, any> = {},
): Promise<TemplateOverride | null> {
  const supabase = getServiceClient()
  if (!supabase) return null
  try {
    const { data: row, error } = await supabase
      .from('email_template_overrides')
      .select('subject, preview, greeting, intro, outro, cta_label, footer, enabled')
      .eq('template_name', templateName)
      .maybeSingle()
    if (error || !row) return null
    return {
      subject: interpolate(row.subject, data),
      preview: interpolate(row.preview, data),
      greeting: interpolate(row.greeting, data),
      intro: interpolate(row.intro, data),
      outro: interpolate(row.outro, data),
      ctaLabel: interpolate(row.cta_label, data),
      footer: interpolate(row.footer, data),
      enabled: row.enabled !== false,
    }
  } catch {
    return null
  }
}

export const PLACEHOLDERS = ['kundenname', 'haendlerName', 'auftragsNr', 'lieferadresse', 'reason', 'etaWindow', 'etaCenter']