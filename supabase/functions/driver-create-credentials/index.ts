import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

// Stronger PIN: 10 chars from an unambiguous alphabet (no 0/O/1/l/I) → ~53^10 ≈ 1.7e17 combinations.
// Still typeable on a phone keyboard. Supabase Auth additionally rate-limits sign-in attempts.
const PIN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function generatePin(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PIN_ALPHABET[b % PIN_ALPHABET.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht authentifiziert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Ungültige Sitzung" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Nur Admins" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const driverId: string = body.driver_id;
    const username: string = (body.username ?? "").trim().toLowerCase();

    if (!driverId || !USERNAME_RE.test(username)) {
      return new Response(
        JSON.stringify({ error: "Ungültiger Username (3-32 Zeichen, a-z0-9._-)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: driver, error: driverErr } = await admin
      .from("drivers")
      .select("id, name, auth_user_id")
      .eq("id", driverId)
      .maybeSingle();
    if (driverErr || !driver) {
      return new Response(JSON.stringify({ error: "Fahrer nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (driver.auth_user_id) {
      return new Response(
        JSON.stringify({ error: "Fahrer hat bereits einen Login. Bitte PIN zurücksetzen." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const email = `${username}@drivers.e-cargo.local`;
    const pin = generatePin(10);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { driver_id: driver.id, username, full_name: driver.name },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Auth-User Erstellung fehlgeschlagen" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await admin
      .from("drivers")
      .update({ username, auth_user_id: created.user.id })
      .eq("id", driver.id);
    if (updErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "driver" });
    if (roleErr && !roleErr.message.includes("duplicate")) {
      console.error("role insert error", roleErr);
    }

    return new Response(JSON.stringify({ username, pin }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});