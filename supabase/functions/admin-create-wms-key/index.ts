import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `wms_live_${b64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Nur POST erlaubt" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Nicht authentifiziert" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Nicht authentifiziert" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "Nur Admins erlaubt" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const profileId = String(body.profile_id ?? "").trim();
  const label = String(body.label ?? "").trim() || null;
  if (!profileId) return json({ error: "profile_id erforderlich" }, 400);

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("user_id, merchant_code")
    .eq("id", profileId)
    .maybeSingle();
  if (profErr) return json({ error: profErr.message }, 500);
  if (!profile) return json({ error: "Händler nicht gefunden" }, 404);
  if (!profile.merchant_code) {
    return json({ error: "Für diesen Händler ist kein Händlercode hinterlegt" }, 400);
  }

  const plainKey = randomKey();
  const keyHash = await sha256Hex(plainKey);
  const keyPrefix = plainKey.slice(0, 17);

  const { data: inserted, error: insErr } = await admin
    .from("wms_api_keys")
    .insert({
      user_id: profile.user_id,
      merchant_code: profile.merchant_code,
      label,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      created_by: userData.user.id,
    })
    .select("id, label, key_prefix, active, created_at, last_used_at, merchant_code")
    .single();

  if (insErr || !inserted) return json({ error: insErr?.message ?? "Fehler" }, 500);

  return json({ ok: true, api_key: plainKey, key: inserted }, 201);
});
