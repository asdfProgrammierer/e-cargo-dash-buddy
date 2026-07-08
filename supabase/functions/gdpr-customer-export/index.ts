import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyTrackingSession, extractBearer } from '../_shared/tracking-session.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function signedUrl(supabase: any, bucket: string, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}

async function listAndSign(supabase: any, bucket: string, orderId: string): Promise<string[]> {
  const { data: files } = await supabase.storage.from(bucket).list(orderId, { limit: 100 })
  if (!files || files.length === 0) return []
  const urls: string[] = []
  for (const f of files) {
    const u = await signedUrl(supabase, bucket, `${orderId}/${f.name}`)
    if (u) urls.push(u)
  }
  return urls
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

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', session.order_id)
    .maybeSingle()

  if (error || !order || order.tracking_token !== session.token) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const [{ data: history }, { data: instructions }, { data: stops }] = await Promise.all([
    supabase.from('order_status_history').select('status, reason, created_at').eq('order_id', order.id).order('created_at'),
    supabase.from('delivery_instructions').select('options, freetext, updated_at').eq('order_id', order.id).maybeSingle(),
    supabase.from('route_stops').select('eta, delivery_mode, delivery_recipient, delivery_note, delivered_at, status, created_at')
      .eq('order_id', order.id).order('created_at'),
  ])

  const [signatures, notes, photos] = await Promise.all([
    listAndSign(supabase, 'delivery-signatures', order.id),
    listAndSign(supabase, 'delivery-notes', order.id),
    listAndSign(supabase, 'delivery-photos', order.id),
  ])

  // Audit log
  await supabase.from('admin_audit_log').insert({
    actor_user_id: null,
    actor_role: 'customer',
    entity_type: 'order',
    entity_id: order.id,
    action: 'gdpr_customer_export',
    metadata: { auftrags_nr: order.auftrags_nr },
  })

  const payload = {
    exported_at: new Date().toISOString(),
    exported_by: 'end_customer_via_tracking_session',
    legal_basis: 'DSGVO Art. 15 (Auskunftsrecht)',
    order,
    order_status_history: history ?? [],
    delivery_instructions: instructions ?? null,
    route_stops: stops ?? [],
    delivery_evidence: {
      signatures_download_links_valid_5min: signatures,
      delivery_notes_download_links_valid_5min: notes,
      delivery_photos_download_links_valid_5min: photos,
    },
  }

  const filename = `dsgvo-export-${order.auftrags_nr}-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})