import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Notification-only bookkeeping: suppression itself is enforced by Lovable
// at send time. These rows keep the project's existing email history tables
// in sync so the admin views keep working.
async function record(
  event: { event_id?: string; data?: Record<string, unknown> },
  reason: 'bounce' | 'complaint' | 'unsubscribe',
  status: 'bounced' | 'complained' | 'suppressed',
  message: string,
): Promise<void> {
  const data = (event.data ?? {}) as { recipient?: string; message_id?: string }
  const recipient = (data.recipient ?? '').toLowerCase()
  if (!recipient) return

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email: recipient, reason, metadata: null }, { onConflict: 'email' })
  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      event_id: event.event_id,
      error: { code: suppressError.code, message: suppressError.message },
    })
    throw new Error('Failed to write suppression')
  }

  const { error: insertError } = await supabase.from('email_send_log').insert({
    message_id: data.message_id ?? null,
    template_name: 'system',
    recipient_email: recipient,
    status,
    error_message: message,
    metadata: null,
  })
  if (insertError) {
    // Non-fatal — the suppression record is already stored.
    console.warn('Failed to insert email_send_log', {
      event_id: event.event_id,
      error: { code: insertError.code, message: insertError.message },
    })
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record(
        event,
        'bounce',
        'bounced',
        'Permanent bounce — email address is invalid or rejected',
      )
    },
    'email.complaint': async (event) => {
      await record(
        event,
        'complaint',
        'complained',
        'Spam complaint — recipient marked email as spam',
      )
    },
    'email.unsubscribed': async (event) => {
      await record(event, 'unsubscribe', 'suppressed', 'Recipient unsubscribed')
    },
  },
})

Deno.serve((req) => handler(req))
