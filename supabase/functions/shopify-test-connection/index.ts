import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "Nicht authentifiziert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ ok: false, error: "Nur Admins" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { connectionId } = await req.json() as { connectionId?: string };
    if (!connectionId) throw new Error("connectionId fehlt");

    const { data: conn, error: connErr } = await admin
      .from("shop_connections")
      .select("id, platform, api_key, api_url, shop_domain")
      .eq("id", connectionId).maybeSingle();
    if (connErr || !conn) throw new Error("Verbindung nicht gefunden");

    if (conn.platform !== "shopify") {
      return new Response(JSON.stringify({ ok: false, error: `Test für ${conn.platform} noch nicht unterstützt` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = normalizeDomain(conn.shop_domain ?? conn.api_url);
    if (!domain) throw new Error("Shop-Domain fehlt");
    if (!conn.api_key) throw new Error("Access Token fehlt");

    const res = await fetch(`https://${domain}/admin/api/2024-10/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": conn.api_key,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return new Response(JSON.stringify({
        ok: false,
        error: `Shopify ${res.status}: ${body.slice(0, 300)}`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const json = await res.json() as { shop?: { name?: string; myshopify_domain?: string; email?: string } };
    return new Response(JSON.stringify({
      ok: true,
      shop: {
        name: json.shop?.name ?? null,
        domain: json.shop?.myshopify_domain ?? domain,
        email: json.shop?.email ?? null,
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String((err as Error).message ?? err) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});