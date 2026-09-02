import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.1.0'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { loadTemplateOverride } from '../_shared/transactional-email-templates/overrides.ts'
import { buildTrackingUrl } from '../_shared/site-url.ts'

// Configuration baked in at scaffold time — do NOT change these manually.
const SITE_NAME = 'e-cargo Connect'
// SENDER_DOMAIN is the verified sender subdomain FQDN.
const SENDER_DOMAIN = 'notify.ecargo-logistik.de'
// FROM_DOMAIN is the domain shown in the From: header.
const FROM_DOMAIN = 'ecargo-logistik.de'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Auth note: verify_jwt = true in config.toml validates the JWT signature, but the
// public anon key is also a valid JWT — so we additionally reject anon-role callers
// in-function. Only authenticated users (merchants/admins/drivers) and the
// service_role may trigger app emails.
function decodeJwtRole(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded + '==='.slice((padded.length + 3) % 4))
    return (JSON.parse(json)?.role as string) ?? null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const role = decodeJwtRole(token)
  if (!role || role === 'anon') {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  const messageId = crypto.randomUUID()
  let templateData: Record<string, any> = {}
  let orderId: string | undefined
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
    orderId = typeof body.orderId === 'string' ? body.orderId : undefined
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ------------------------------------------------------------------
  // Authorization: prevent authenticated users from turning this
  // endpoint into an open email relay with attacker-controlled content.
  // ------------------------------------------------------------------
  const isServiceRole = role === 'service_role'
  let callerUserId: string | null = null
  if (!isServiceRole) {
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    callerUserId = userData.user.id
  }

  if (templateName === 'gdpr-delete-confirm' && !isServiceRole) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  let isAdmin = false
  if (callerUserId) {
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('role', 'admin')
      .maybeSingle()
    isAdmin = !!roleRow
  }

  if (templateName.startsWith('order-') && !isServiceRole && !isAdmin) {
    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'orderId is required for order-* templates' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const { data: order } = await supabase
      .from('orders')
      .select('id, user_id, auftrags_nr, empfaenger_name, empfaenger_email, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, tracking_token')
      .eq('id', orderId)
      .maybeSingle()
    if (!order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let allowed = order.user_id === callerUserId
    if (!allowed && callerUserId) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('parent_user_id')
        .eq('user_id', callerUserId)
        .maybeSingle()
      if (prof?.parent_user_id && prof.parent_user_id === order.user_id) allowed = true
    }
    if (!allowed && callerUserId) {
      const { data: driverRow } = await supabase
        .from('drivers')
        .select('id')
        .eq('auth_user_id', callerUserId)
        .maybeSingle()
      if (driverRow?.id) {
        const { data: assigned } = await supabase
          .from('route_stops')
          .select('id, routes!inner(driver_id)')
          .eq('order_id', orderId)
          .eq('routes.driver_id', driverRow.id)
          .limit(1)
          .maybeSingle()
        if (assigned) allowed = true
      }
    }
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: not authorized for this order' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Force recipient + identifying template fields to values derived from
    // the order record. Preserve caller-supplied context fields.
    if (!order.empfaenger_email) {
      return new Response(
        JSON.stringify({ error: 'Order has no recipient email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    recipientEmail = order.empfaenger_email

    const { data: prof } = await supabase
      .from('profiles')
      .select('firma_name, ansprechpartner')
      .eq('user_id', order.user_id)
      .maybeSingle()
    const haendlerName =
      (prof?.firma_name?.trim() || prof?.ansprechpartner?.trim() || 'Ihr Händler')
    const lieferadresse = [
      order.empfaenger_name,
      order.empfaenger_adresse,
      [order.empfaenger_plz, order.empfaenger_stadt].filter(Boolean).join(' '),
    ].filter((x) => x && String(x).trim().length > 0).join(', ')

    templateData = {
      ...templateData,
      kundenname: order.empfaenger_name,
      haendlerName,
      auftragsNr: order.auftrags_nr,
      lieferadresse,
      trackingUrl: buildTrackingUrl(order.tracking_token, req),
    }
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail.
  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 2. Render React Email template to HTML and plain text.
  // Lade Admin-Overrides (Texte aus DB) und injiziere sie in die Template-Props.
  const override = await loadTemplateOverride(templateName, templateData)

  // Wenn ein Override existiert und explizit deaktiviert wurde, Versand überspringen.
  if (override && override.enabled === false) {
    const { error: logErr } = await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message: 'Template disabled via admin override',
    })
    if (logErr) console.error('email_send_log insert failed', logErr)
    console.log('Email skipped — template disabled', { templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'template_disabled' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const propsForRender = { ...templateData, __override: override ?? undefined }

  const html = await renderAsync(
    React.createElement(template.component, propsForRender)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, propsForRender),
    { plainText: true }
  )

  // Resolve subject — Override hat Vorrang
  const resolvedSubject =
    (override?.subject && override.subject.trim().length > 0)
      ? override.subject
      : (typeof template.subject === 'function'
          ? template.subject(templateData)
          : template.subject)

  // 3. Send through Lovable's managed email API. Suppression, retries and
  // rate limits are enforced server-side by Lovable.
  try {
    await sendLovableEmail(
      {
        to: effectiveRecipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: resolvedSubject,
        html,
        text: plainText,
        purpose: 'transactional',
        label: templateName,
        idempotency_key: idempotencyKey,
      },
      { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      const { error: logErr } = await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'suppressed',
      })
      if (logErr) console.error('email_send_log insert failed', logErr)
      console.log('Email suppressed', { templateName })
      return new Response(
        JSON.stringify({ success: false, reason: 'email_suppressed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('Email send failed', { templateName, error: errorMsg })
    const { error: logErr } = await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: errorMsg.slice(0, 1000),
    })
    if (logErr) console.error('email_send_log insert failed', logErr)
    return new Response(
      JSON.stringify({ error: 'Failed to send email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { error: logErr } = await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'sent',
  })
  if (logErr) console.error('email_send_log insert failed', logErr)

  console.log('App email sent', { templateName })

  return new Response(
    JSON.stringify({ success: true, sent: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
