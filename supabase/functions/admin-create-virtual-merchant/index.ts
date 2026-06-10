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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Nicht authentifiziert" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Nicht authentifiziert" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: isAdminData } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdminData) return json({ error: "Nur Admins erlaubt" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const firmaName = String(body.firma_name ?? "").trim();
  const merchantCodeRaw = String(body.merchant_code ?? "").trim().toUpperCase();
  const ansprechpartner = String(body.ansprechpartner ?? "").trim() || firmaName;
  const strasse = String(body.strasse ?? "").trim() || null;
  const plz = String(body.plz ?? "").trim() || null;
  const stadt = String(body.stadt ?? "").trim() || null;
  const telefon = String(body.telefon ?? "").trim() || null;
  const paketpreisRaw = body.paketpreis;
  const paketpreis =
    paketpreisRaw === null || paketpreisRaw === undefined || paketpreisRaw === ""
      ? null
      : Number(String(paketpreisRaw).replace(",", "."));

  if (!firmaName) return json({ error: "Firmenname erforderlich" }, 400);
  if (!/^[A-Z0-9]{3}$/.test(merchantCodeRaw)) {
    return json({ error: "Händlercode muss genau 3 Zeichen (A-Z, 0-9) haben" }, 400);
  }
  if (paketpreis !== null && (!Number.isFinite(paketpreis) || paketpreis < 0)) {
    return json({ error: "Ungültiger Paketpreis" }, 400);
  }

  // Make sure code is unique (case-insensitive)
  const { data: existingCode } = await admin
    .from("profiles")
    .select("id")
    .eq("merchant_code", merchantCodeRaw)
    .maybeSingle();
  if (existingCode) {
    return json({ error: "Dieser Händlercode ist bereits vergeben" }, 400);
  }

  // Synthetic email — guaranteed unique, never receives mail
  const internalEmail = `virtual+${merchantCodeRaw.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}@ecargo.internal`;
  const randomPassword = crypto.randomUUID() + crypto.randomUUID();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: internalEmail,
    password: randomPassword,
    email_confirm: true,
    user_metadata: { full_name: ansprechpartner, virtual_merchant: true },
  });
  if (createErr || !created.user) {
    return json({ error: createErr?.message ?? "Konto konnte nicht erstellt werden" }, 500);
  }

  // Ban the auth user so login is impossible (very long ban)
  await admin.auth.admin.updateUserById(created.user.id, { ban_duration: "876000h" });

  // handle_new_user trigger has already inserted a profile row — update it
  const { error: updErr } = await admin
    .from("profiles")
    .update({
      firma_name: firmaName,
      ansprechpartner,
      strasse,
      plz,
      stadt,
      telefon,
      paketpreis,
      merchant_code: merchantCodeRaw,
      approved: true,
      is_virtual: true,
    })
    .eq("user_id", created.user.id);

  if (updErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: updErr.message }, 500);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", created.user.id)
    .single();

  return json({ ok: true, profile });
});