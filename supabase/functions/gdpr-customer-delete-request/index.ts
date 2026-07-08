import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyTrackingSession, extractBearer } from '../_shared/tracking-session.ts'
import { getPublicSiteUrl } from '../_shared/site-url.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_TTL_HOURS = 24
const MAX_OPEN_TOKENS_PER_ORDER = 3

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const bearer = extractBearer(req)
  if (!bearer) {
    return new Response(JSON.stringify({ error: 'missing_session' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const session = await verifyTrackingSession(bearer, serviceKey)
  if (!session) {
    return new Response(JSON.stringify({ error: 'invalid_session' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { email?: string }
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return new Response(JSON.stringify({ error: 'invalid_email' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: order } = await supabase
    .from('orders')
    .select('id, auftrags_nr, empfaenger_email, tracking_token, anonymized_at, user_id')
    .eq('id', session.order_id)
    .maybeSingle()

  if (!order || order.tracking_token !== session.token) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (order.anonymized_at) {
    return new Response(JSON.stringify({ error: 'already_anonymized' }), {
      status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!order.empfaenger_email) {
    return new Response(JSON.stringify({ error: 'no_email_on_file' }), {
      status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (order.empfaenger_email.trim().toLowerCase() !== email) {
    // Generic to avoid leaking whether the on-file address is set
    return new Response(JSON.stringify({ error: 'email_mismatch' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Rate limit
  const { count: openCount } = await supabase
    .from('gdpr_deletion_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order.id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
  if ((openCount ?? 0) >= MAX_OPEN_TOKENS_PER_ORDER) {
    return new Response(JSON.stringify({ error: 'too_many_requests' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rawToken = generateToken()
  const tokenHash = await sha256Hex(rawToken)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000).toISOString()

  const { error: insErr } = await supabase.from('gdpr_deletion_tokens').insert({
    order_id: order.id,
    token_hash: tokenHash,
    requested_email: email,
    expires_at: expiresAt,
  })
  if (insErr) {
    console.error('token insert failed', insErr)
    return new Response(JSON.stringify({ error: 'token_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const confirmUrl = `${getPublicSiteUrl(req)}/gdpr/confirm-delete?token=${rawToken}`

  const { error: mailErr } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      templateName: 'gdpr-delete-confirm',
      recipientEmail: email,
      idempotencyKey: `gdpr-delete-${tokenHash}`,
      templateData: {
        auftragsNr: order.auftrags_nr,
        confirmUrl,
        expiresHours: TOKEN_TTL_HOURS,
      },
    },
  })
  if (mailErr) {
    console.error('enqueue_email failed', mailErr)
    return new Response(JSON.stringify({ error: 'mail_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, expiresInHours: TOKEN_TTL_HOURS }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})