import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const RECIPIENTS = ['boehle@ecargo-logistic.de', 'dirk.fromme@ecargo-logistic.de']
const STATUS: Record<string, string> = {
  neu: 'Neu', in_bearbeitung: 'In Bearbeitung', unterwegs: 'Unterwegs',
  zugestellt: 'Zugestellt', nicht_zugestellt: 'Nicht zugestellt', storniert: 'Storniert',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: u } = await supabase.auth.getUser(token)
  const user = u?.user
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Ungültige Anfrage' }, 400) }
  const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'Ungültiger Auftrag' }, 400)
  if (message.length < 3 || message.length > 2000) return json({ error: 'Bitte 3–2000 Zeichen eingeben' }, 400)

  const { data: order } = await supabase.from('orders')
    .select('id, user_id, auftrags_nr, status, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, delivered_at')
    .eq('id', orderId).maybeSingle()
  if (!order) return json({ error: 'Auftrag nicht gefunden' }, 404)

  const { data: me } = await supabase.from('profiles').select('parent_user_id').eq('user_id', user.id).maybeSingle()
  const ownerId = me?.parent_user_id ?? user.id
  if (order.user_id !== ownerId) return json({ error: 'Kein Zugriff' }, 403)

  const { data: prof } = await supabase.from('profiles')
    .select('firma_name, ansprechpartner, telefon').eq('user_id', ownerId).maybeSingle()
  const haendlerName = prof?.firma_name?.trim() || prof?.ansprechpartner?.trim() || 'Händler'

  let zustellung: string | undefined
  const { data: stop } = await supabase.from('route_stops')
    .select('delivered_at, delivery_note, status, routes(drivers(name))')
    .eq('order_id', orderId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (stop && stop.status !== 'offen') {
    const when = stop.delivered_at ?? order.delivered_at
    const parts = [
      when ? new Date(when).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : null,
      (stop as any).routes?.drivers?.name ? `Fahrer ${(stop as any).routes.drivers.name}` : null,
      stop.delivery_note || null,
    ].filter(Boolean)
    if (parts.length) zustellung = parts.join(' · ')
  }

  const templateData = {
    auftragsNr: order.auftrags_nr, haendlerName, haendlerEmail: user.email ?? undefined,
    haendlerTelefon: prof?.telefon ?? undefined, nachricht: message,
    empfaenger: [order.empfaenger_name, order.empfaenger_adresse, [order.empfaenger_plz, order.empfaenger_stadt].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    status: STATUS[order.status] ?? order.status, zustellung,
    adminUrl: 'https://ecargo-connect.ecargo-logistik.de/admin',
  }
  const inquiryId = crypto.randomUUID()
  try {
    for (const to of RECIPIENTS) {
      await sendTemplateEmail('merchant-inquiry', to, {
        templateData, replyTo: user.email ?? undefined,
        idempotencyKey: `merchant-inquiry-${inquiryId}-${to}`,
      })
    }
  } catch (e) {
    console.error('inquiry send failed', e)
    return json({ error: 'E-Mail konnte nicht gesendet werden' }, 500)
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id, actor_role: 'merchant', entity_type: 'order', entity_id: order.id,
    action: 'merchant_inquiry', metadata: { auftrags_nr: order.auftrags_nr, message: message.slice(0, 500) },
  })
  return json({ success: true })
})
