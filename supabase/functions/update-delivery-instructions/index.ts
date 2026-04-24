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

const OPTION_LABELS: Record<string, string> = {
  nachbar: 'Beim Nachbarn abgeben',
  hausflur: 'Im Hausflur ablegen',
  sicherer_ort: 'An sicherem Ort ablegen',
  garage: 'In Garage / Carport ablegen',
  keine: 'Keine Sonderwünsche',
}

const NOTE_MARKER_START = '--- Lieferanweisung des Kunden ---'
const NOTE_MARKER_END = '--- Ende Lieferanweisung ---'

function buildInstructionsNote(options: string[], freetext: string | null): string | null {
  const parts: string[] = []
  if (options.length) {
    parts.push('Optionen: ' + options.map((o) => OPTION_LABELS[o] ?? o).join(', '))
  }
  if (freetext) {
    parts.push('Hinweis: ' + freetext)
  }
  if (!parts.length) return null
  return `${NOTE_MARKER_START}\n${parts.join('\n')}\n${NOTE_MARKER_END}`
}

function stripPreviousBlock(notes: string | null): string {
  if (!notes) return ''
  const startIdx = notes.indexOf(NOTE_MARKER_START)
  if (startIdx === -1) return notes
  const endIdx = notes.indexOf(NOTE_MARKER_END, startIdx)
  const before = notes.slice(0, startIdx).replace(/\s+$/, '')
  const after = endIdx === -1 ? '' : notes.slice(endIdx + NOTE_MARKER_END.length).replace(/^\s+/, '')
  return [before, after].filter(Boolean).join('\n\n')
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
    .select('id, status, tracking_token, notizen')
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

  // Mirror instructions into the order's notes so the team sees them at a glance.
  const baseNotes = stripPreviousBlock(order.notizen as string | null)
  const block = buildInstructionsNote(options, freetext)
  const merged = [baseNotes, block].filter(Boolean).join('\n\n').trim()
  const { error: notesErr } = await supabase
    .from('orders')
    .update({ notizen: merged.length ? merged : null })
    .eq('id', order.id)
  if (notesErr) {
    console.error('Update order notes failed', notesErr)
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
