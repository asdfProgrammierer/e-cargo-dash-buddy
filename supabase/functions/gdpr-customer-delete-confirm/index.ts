import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  let body: { token?: string }
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const rawToken = (body.token ?? '').trim()
  if (!/^[a-f0-9]{64}$/.test(rawToken)) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const tokenHash = await sha256Hex(rawToken)

  const { data: row } = await supabase
    .from('gdpr_deletion_tokens')
    .select('id, order_id, expires_at, used_at, requested_email')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!row) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (row.used_at) {
    return new Response(JSON.stringify({ error: 'already_used' }), {
      status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ error: 'expired' }), {
      status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Fetch auftrags_nr for audit log before anonymization wipes tracking_token
  const { data: order } = await supabase
    .from('orders')
    .select('id, auftrags_nr, anonymized_at')
    .eq('id', row.order_id)
    .maybeSingle()

  if (!order) {
    return new Response(JSON.stringify({ error: 'order_missing' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Atomically mark token used first (idempotency guard)
  const { data: usedRow, error: updErr } = await supabase
    .from('gdpr_deletion_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle()
  if (updErr || !usedRow) {
    return new Response(JSON.stringify({ error: 'already_used' }), {
      status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!order.anonymized_at) {
    const { data: didAnon, error: anonErr } = await supabase.rpc('anonymize_order', { _order_id: order.id })
    if (anonErr) {
      console.error('anonymize_order failed', anonErr)
      return new Response(JSON.stringify({ error: 'anonymize_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (didAnon === false) {
      // already anonymized in a race — treat as success
    }
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: null,
    actor_role: 'customer',
    entity_type: 'order',
    entity_id: order.id,
    action: 'gdpr_customer_deleted',
    metadata: { auftrags_nr: order.auftrags_nr, requested_email: row.requested_email },
  })

  return new Response(JSON.stringify({ ok: true, auftragsNr: order.auftrags_nr }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})