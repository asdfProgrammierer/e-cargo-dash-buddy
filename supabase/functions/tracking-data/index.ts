import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyTrackingSession, extractBearer } from '../_shared/tracking-session.ts'
import { buildEtaWindow } from '../_shared/eta.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STATUS_LABELS: Record<string, string> = {
  neu: 'Neu',
  in_bearbeitung: 'In Bearbeitung',
  unterwegs: 'Unterwegs',
  zugestellt: 'Zugestellt',
  nicht_zugestellt: 'Nicht zugestellt',
  storniert: 'Storniert',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'GET') {
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

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, auftrags_nr, status, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, created_at, updated_at, delivered_at, user_id, tracking_token, delivery_attempts'
    )
    .eq('id', session.order_id)
    .maybeSingle()

  if (error || !order || order.tracking_token !== session.token) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const [{ data: history }, { data: instructions }, { data: profile }] = await Promise.all([
    supabase
      .from('order_status_history')
      .select('status, reason, created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('delivery_instructions')
      .select('options, freetext, updated_at')
      .eq('order_id', order.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('firma_name, ansprechpartner')
      .eq('user_id', order.user_id)
      .maybeSingle(),
  ])

  const editable = order.status === 'neu' || order.status === 'in_bearbeitung'

  // Lade Routen-Stopp (für ETA und Übergabe-Details)
  const { data: stopRow } = await supabase
    .from('route_stops')
    .select('eta, delivery_mode, delivery_recipient, delivery_note, delivered_at')
    .eq('order_id', order.id)
    .order('eta', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  // ETA-Fenster (sinnvoll ab Status "in_bearbeitung", solange noch nicht zugestellt)
  let etaWindow: { window: string; center: string; fromIso: string; toIso: string; centerIso: string } | null = null
  if (order.status === 'in_bearbeitung' || order.status === 'unterwegs') {
    etaWindow = buildEtaWindow(stopRow?.eta ?? null)
  }

  // Lieferanweisungen können bis 1h vor ETA bearbeitet werden, solange die Bestellung
  // noch nicht final ist. „neu" / „in_bearbeitung" ist immer bearbeitbar.
  let instructionsEditable = order.status === 'neu' || order.status === 'in_bearbeitung'
  if (order.status === 'unterwegs' && stopRow?.eta) {
    const etaMs = new Date(stopRow.eta as string).getTime()
    const oneHourBefore = etaMs - 60 * 60 * 1000
    if (Date.now() < oneHourBefore) instructionsEditable = true
  }

  const deliveryDetails =
    order.status === 'zugestellt'
      ? {
          mode: (stopRow?.delivery_mode as string | null) ?? null,
          recipient: (stopRow?.delivery_recipient as string | null) ?? null,
          note: (stopRow?.delivery_note as string | null) ?? null,
        }
      : null

  return new Response(
    JSON.stringify({
      order: {
        auftragsNr: order.auftrags_nr,
        status: order.status,
        statusLabel: STATUS_LABELS[order.status] ?? order.status,
        empfaengerName: order.empfaenger_name,
        empfaengerAdresse: order.empfaenger_adresse,
        empfaengerPlz: order.empfaenger_plz,
        empfaengerStadt: order.empfaenger_stadt,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        deliveredAt: order.delivered_at,
        haendlerName: profile?.firma_name?.trim() || profile?.ansprechpartner?.trim() || 'Ihr Händler',
        eta: etaWindow,
        delivery: deliveryDetails,
        deliveryAttempts: (order as { delivery_attempts?: number | null }).delivery_attempts ?? 0,
        maxDeliveryAttempts: 3,
      },
      history: (history ?? []).map((h) => ({
        status: h.status,
        statusLabel: STATUS_LABELS[h.status] ?? h.status,
        reason: h.reason,
        createdAt: h.created_at,
      })),
      instructions: instructions
        ? { options: instructions.options ?? [], freetext: instructions.freetext ?? '', updatedAt: instructions.updated_at }
        : { options: [], freetext: '', updatedAt: null },
      editable: instructionsEditable,
      // Backwards-compat (frühere UI nutzte `editable` auf Order-Ebene)
      orderEditable: editable,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
