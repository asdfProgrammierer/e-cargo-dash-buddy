import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BATCH_LIMIT = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    // 1) Orders without coordinates, 2) open orders whose position was never
    // quality-checked (stored before the precision check existed).
    const { data: missing, error: e1 } = await supabase
      .from("orders")
      .select("id, empfaenger_adresse, empfaenger_plz, empfaenger_stadt")
      .or("lat.is.null,lng.is.null")
      .not("status", "in", "(zugestellt,storniert)")
      .order("created_at", { ascending: false })
      .limit(BATCH_LIMIT);
    if (e1) throw e1;
    let orders = missing ?? [];
    if (orders.length < BATCH_LIMIT) {
      const { data: unchecked, error: e2 } = await supabase
        .from("orders")
        .select("id, empfaenger_adresse, empfaenger_plz, empfaenger_stadt")
        .is("geocode_quality", null)
        .not("lat", "is", null)
        .in("status", ["neu", "in_bearbeitung"])
        .order("created_at", { ascending: false })
        .limit(BATCH_LIMIT - orders.length);
      if (e2) throw e2;
      orders = orders.concat(unchecked ?? []);
    }

    let updated = 0;
    let approximate = 0;
    let failed = 0;

    for (const o of orders) {
      try {
        // Reuse the single geocoding engine (incl. precision check).
        const r = await fetch(`${supabaseUrl}/functions/v1/geocode-address`, {
          method: "POST",
          headers: { Authorization: authHeader, apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            strasse: o.empfaenger_adresse ?? "",
            plz: o.empfaenger_plz ?? "",
            stadt: o.empfaenger_stadt ?? "",
          }),
        });
        const geo = await r.json().catch(() => null);
        if (!r.ok || !geo || geo.lat == null || geo.lng == null) {
          failed++;
          continue;
        }
        const quality = geo.quality === "exact" ? "exact" : "approximate";
        const { error: uErr } = await supabase
          .from("orders")
          .update({
            lat: geo.lat,
            lng: geo.lng,
            geocoded_at: new Date().toISOString(),
            geocode_quality: quality,
            geocode_note: geo.note ?? null,
          })
          .eq("id", o.id);
        if (uErr) failed++;
        else {
          updated++;
          if (quality === "approximate") approximate++;
        }
      } catch (e) {
        console.warn("regeocode failed", o.id, e);
        failed++;
      }
    }

    return json({ total: orders.length, updated, approximate, failed });
  } catch (e) {
    console.error("regeocode-pickup-orders error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
