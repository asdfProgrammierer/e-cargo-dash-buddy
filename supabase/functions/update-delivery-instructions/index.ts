import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyTrackingSession, extractBearer } from '../_shared/tracking-session.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_OPTIONS = new Set([
  'nachbar',
  'hausflur',
  'sicherer_ort',
  'garage',
  'keine',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const bearer = extractBearer(req)
  if (!bearer) {
    return new Response(JSON.stringify({ error: 'missing_session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const session = await verifyTrackingSession(bearer, serviceKey)
  if (!session) {
    return new Response(JSON.stringify({ error: 'invalid_session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { options?: string[]; freetext?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const options = Array.isArray(body.options)
    ? Array.from(new Set(body.options.filter((o) => typeof o === 'string' && ALLOWED_OPTIONS.has(o))))
    : []
  let freetext: string | null = null
  if (typeof body.freetext === 'string') {
    const trimmed = body.freetext.trim().slice(0, 200)
    freetext = trimmed.length ? trimmed : null
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, tracking_token')
    .eq('id', session.order_id)
    .maybeSingle()

  if (orderErr || !order || order.tracking_token !== session.token) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (order.status !== 'neu' && order.status !== 'in_bearbeitung') {
    return new Response(JSON.stringify({ error: 'locked', status: order.status }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: upsertErr } = await supabase
    .from('delivery_instructions')
    .upsert(
      { order_id: order.id, options, freetext, updated_at: new Date().toISOString() },
      { onConflict: 'order_id' }
    )

  if (upsertErr) {
    console.error('Upsert delivery instructions failed', upsertErr)
    return new Response(JSON.stringify({ error: 'save_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
