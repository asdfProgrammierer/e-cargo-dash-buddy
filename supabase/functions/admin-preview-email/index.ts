import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function interpolate(value: string | null | undefined, data: Record<string, any>): string | undefined {
  if (!value) return undefined
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = data?.[k]
    return v === undefined || v === null ? '' : String(v)
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Verify caller is admin
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const admin = createClient(url, serviceKey)
  const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle()
  if (!roleRow) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let body: any
  try { body = await req.json() } catch { body = {} }
  const templateName: string = body.templateName
  // overrideDraft = unsaved override values from the editor (preferred), otherwise read from DB
  const overrideDraft = body.overrideDraft ?? null

  const entry = TEMPLATES[templateName]
  if (!entry) {
    return new Response(JSON.stringify({ error: `Unknown template ${templateName}` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const previewData = entry.previewData ?? {}

  let override: any = overrideDraft
  if (!override) {
    const { data: row } = await admin.from('email_template_overrides').select('subject, preview, greeting, intro, outro, cta_label, footer, enabled').eq('template_name', templateName).maybeSingle()
    if (row) {
      override = {
        subject: row.subject, preview: row.preview, greeting: row.greeting,
        intro: row.intro, outro: row.outro, ctaLabel: row.cta_label, footer: row.footer,
        enabled: row.enabled,
      }
    }
  }

  const interpolated = override ? {
    subject: interpolate(override.subject, previewData),
    preview: interpolate(override.preview, previewData),
    greeting: interpolate(override.greeting, previewData),
    intro: interpolate(override.intro, previewData),
    outro: interpolate(override.outro, previewData),
    ctaLabel: interpolate(override.ctaLabel, previewData),
    footer: interpolate(override.footer, previewData),
    enabled: override.enabled !== false,
  } : null

  const props = { ...previewData, __override: interpolated ?? undefined }

  const html = await renderAsync(React.createElement(entry.component, props))
  const subject = (interpolated?.subject && interpolated.subject.trim().length > 0)
    ? interpolated.subject
    : (typeof entry.subject === 'function' ? entry.subject(previewData) : entry.subject)

  return new Response(JSON.stringify({ html, subject, previewData }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})