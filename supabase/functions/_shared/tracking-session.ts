function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function base64UrlEncode(data: Uint8Array): string {
  let s = ''
  for (const b of data) s += String.fromCharCode(b)
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export interface TrackingSessionPayload {
  order_id: string
  token: string
  iat: number
  exp: number
}

export async function verifyTrackingSession(
  jwt: string,
  secret: string
): Promise<TrackingSessionPayload | null> {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  const [headerB64, bodyB64, sigB64] = parts
  const data = `${headerB64}.${bodyB64}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  )
  if (base64UrlEncode(expected) !== sigB64) return null
  let payload: TrackingSessionPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(bodyB64)))
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null
  }
  if (typeof payload.order_id !== 'string' || typeof payload.token !== 'string') {
    return null
  }
  return payload
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!auth) return null
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return m ? m[1].trim() : null
}
