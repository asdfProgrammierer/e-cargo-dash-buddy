import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://ecargo-logistik.de",
  "https://www.ecargo-logistik.de",
]);

const APP_ORIGIN = "https://ecargo-connect.ecargo-logistik.de";

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://ecargo-logistik.de";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Naive in-memory rate limit (per function instance)
const HITS = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = HITS.get(ip);
  if (!entry || entry.resetAt < now) {
    HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > LIMIT;
}

const AUFTRAGS_NR_RE = /^EC-[A-Z0-9]+-P?\d{7}$/;

Deno.serve(async (req) => {
  const cors = corsFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Zu viele Versuche, bitte später erneut." }), {
      status: 429,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Ungültige Anfrage" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const auftragsNr = String(body?.auftrags_nr ?? "").toUpperCase().trim();

  if (!AUFTRAGS_NR_RE.test(auftragsNr)) {
    return new Response(JSON.stringify({ error: "Sendung nicht gefunden" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("orders")
    .select("tracking_token")
    .eq("auftrags_nr", auftragsNr)
    .maybeSingle();

  if (error) {
    console.error("lookup error", error);
    return new Response(JSON.stringify({ error: "Sendung nicht gefunden" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!data || !data.tracking_token) {
    return new Response(JSON.stringify({ error: "Sendung nicht gefunden" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      token: data.tracking_token,
      url: `${APP_ORIGIN}/track/${data.tracking_token}`,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});