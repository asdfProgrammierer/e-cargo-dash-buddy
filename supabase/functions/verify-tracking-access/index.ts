import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SESSION_TTL_SECONDS = 30 * 60 // 30 Minuten

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function signSession(payload: object, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(payload))
  const data = `${header}.${body}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  return `${data}.${base64UrlEncode(sig)}`
}

function normalizePlz(plz: string): string {
  return (plz || '').trim().replace(/\s+/g, '')
}

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

  let body: { token?: string; plz?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const token = (body.token || '').trim()
  const plz = normalizePlz(body.plz || '')

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!/^\d{4,5}$/.test(plz)) {
    return new Response(JSON.stringify({ error: 'invalid_plz' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, empfaenger_plz, tracking_token')
    .eq('tracking_token', token)
    .maybeSingle()

  if (error) {
    console.error('Tracking lookup failed', error)
    return new Response(JSON.stringify({ error: 'lookup_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!order) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const expectedPlz = normalizePlz(order.empfaenger_plz || '')
  if (!expectedPlz || expectedPlz !== plz) {
    // Generischer Fehler — verrät nicht ob Token oder PLZ falsch war
    return new Response(JSON.stringify({ error: 'invalid_credentials' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const now = Math.floor(Date.now() / 1000)
  const session = await signSession(
    { order_id: order.id, token: order.tracking_token, iat: now, exp: now + SESSION_TTL_SECONDS },
    serviceKey
  )

  return new Response(
    JSON.stringify({ session, expiresIn: SESSION_TTL_SECONDS }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
