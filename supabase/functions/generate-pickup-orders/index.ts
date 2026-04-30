import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Wochentag laut Profilen: 1=Mo ... 7=So (ISO)
function isoWeekdayBerlin(date = new Date()): number {
  // Convert to Europe/Berlin local date
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  });
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[fmt.format(date)] ?? 0;
}

function berlinDateString(date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // YYYY-MM-DD
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Optional override via body
    let forceWeekday: number | null = null;
    let dryRun = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.weekday === "number") forceWeekday = body.weekday;
        if (body?.dryRun === true) dryRun = true;
      } catch {
        // ignore
      }
    }

    const weekday = forceWeekday ?? isoWeekdayBerlin();
    const today = berlinDateString();

    const { data: merchants, error: mErr } = await supabase
      .from("profiles")
      .select(
        "id, user_id, firma_name, ansprechpartner, telefon, strasse, plz, stadt, pickup_enabled, pickup_weekdays, approved",
      )
      .eq("pickup_enabled", true)
      .eq("approved", true);

    if (mErr) throw mErr;

    const eligible = (merchants ?? []).filter((m: any) =>
      Array.isArray(m.pickup_weekdays) && m.pickup_weekdays.includes(weekday) &&
      m.strasse && m.plz && m.stadt
    );

    const results: Array<{ merchant: string; status: string; orderId?: string; reason?: string }> = [];

    for (const m of eligible) {
      // Skip if a pickup order for this merchant already exists today
      const { data: existing, error: exErr } = await supabase
        .from("orders")
        .select("id, created_at")
        .eq("user_id", m.user_id)
        .eq("is_pickup", true)
        .gte("created_at", `${today}T00:00:00+00:00`)
        .limit(1);

      if (exErr) {
        results.push({ merchant: m.firma_name ?? m.id, status: "error", reason: exErr.message });
        continue;
      }

      if (existing && existing.length > 0) {
        results.push({ merchant: m.firma_name ?? m.id, status: "skipped_exists", orderId: existing[0].id });
        continue;
      }

      if (dryRun) {
        results.push({ merchant: m.firma_name ?? m.id, status: "dry_run" });
        continue;
      }

      const senderName = m.firma_name || m.ansprechpartner || "Händler";
      const adresse = `${m.strasse}, ${m.plz} ${m.stadt}`;

      const { data: inserted, error: insErr } = await supabase
        .from("orders")
        .insert({
          user_id: m.user_id,
          auftrags_nr: "",
          absender_name: senderName,
          absender_adresse: adresse,
          empfaenger_name: senderName,
          empfaenger_adresse: m.strasse,
          empfaenger_plz: m.plz,
          empfaenger_stadt: m.stadt,
          empfaenger_email: null,
          empfaenger_telefon: m.telefon ?? null,
          pakete: 1,
          gewicht: 0,
          notizen: "[ABHOLUNG] Automatisch generierter Abhol-Auftrag",
          is_pickup: true,
        })
        .select("id")
        .single();

      if (insErr) {
        results.push({ merchant: m.firma_name ?? m.id, status: "error", reason: insErr.message });
      } else {
        results.push({ merchant: m.firma_name ?? m.id, status: "created", orderId: inserted.id });
      }
    }

    return new Response(
      JSON.stringify({ weekday, today, eligibleCount: eligible.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("generate-pickup-orders error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});