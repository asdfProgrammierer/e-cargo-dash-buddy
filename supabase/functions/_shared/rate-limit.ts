import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const TRACKING_LIMIT = 20;
export const TRACKING_WINDOW_SECONDS = 15 * 60;

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Persistent per-IP limit; IP is stored only as SHA-256 hash. Fails open on DB errors. */
export async function checkRateLimit(
  supabase: SupabaseClient,
  scope: string,
  ip: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const key = `${scope}:${await sha256(ip)}`;
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max: TRACKING_LIMIT,
    p_window_seconds: TRACKING_WINDOW_SECONDS,
  });
  if (error || !data) {
    console.error("rate limit check failed", error);
    return { allowed: true, retryAfter: 0 };
  }
  return { allowed: !!(data as any).allowed, retryAfter: Number((data as any).retry_after) || 60 };
}
