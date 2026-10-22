import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { driverAuthPassword } from "../_shared/driver-pin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

// 6-digit numeric PIN (driver request); Auth rate-limits sign-in attempts.
const PIN_ALPHABET = "0123456789";
function generatePin(length = 6): string {
  const vals = new Uint32Array(length);
  crypto.getRandomValues(vals);
  return Array.from(vals, (v) => PIN_ALPHABET[v % PIN_ALPHABET.length]).join("");
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
    const pin = generatePin(6);

    let created: { user: { id: string } | null } = { user: null };
    const createRes = await admin.auth.admin.createUser({
      email,
      password: driverAuthPassword(username, pin),
      email_confirm: true,
      user_metadata: { driver_id: driver.id, username, full_name: driver.name },
    });
    let createErr = createRes.error;
    created = { user: createRes.data?.user ?? null };

    // Username already taken: reuse it only if the old login is orphaned (driver deleted).
    if (createErr && /already been registered|email_exists/i.test(createErr.message)) {
      let existingId: string | null = null;
      for (let page = 1; page <= 20 && !existingId; page++) {
        const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        const hit = list?.users.find((u) => u.email?.toLowerCase() === email);
        if (hit) existingId = hit.id;
        if (!list || list.users.length < 1000) break;
      }
      if (existingId) {
        const { data: linked } = await admin
          .from("drivers").select("id").eq("auth_user_id", existingId).maybeSingle();
        if (linked) {
          return new Response(
            JSON.stringify({ error: `Benutzername „${username}“ ist bereits an einen anderen Fahrer vergeben.` }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const { error: updUserErr } = await admin.auth.admin.updateUserById(existingId, {
          password: driverAuthPassword(username, pin),
          email_confirm: true,
          user_metadata: { driver_id: driver.id, username, full_name: driver.name },
        });
        if (updUserErr) console.error("reuse update failed", updUserErr.message);
        if (!updUserErr) {
          createErr = null;
          created = { user: { id: existingId } };
        }
      }
    }

    if (createErr || !created.user) {
      console.error("create login failed", username, createErr?.message);
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
      console.error("driver link failed", updErr.message);
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