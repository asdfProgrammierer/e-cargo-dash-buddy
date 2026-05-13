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

function berlinHourMinute(date = new Date()): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { hour, minute };
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

function berlinDayRangeUtc(date = new Date()): { startUtc: string; endUtc: string } {
  // Find UTC offset (in minutes) for Europe/Berlin at the given instant
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "shortOffset",
    hour: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = /GMT([+-]?\d{1,2})(?::(\d{2}))?/.exec(tzName);
  const offsetHours = match ? parseInt(match[1], 10) : 1;
  const offsetMinutes = match && match[2] ? parseInt(match[2], 10) : 0;
  const sign = offsetHours >= 0 ? "+" : "-";
  const hh = String(Math.abs(offsetHours)).padStart(2, "0");
  const mm = String(offsetMinutes).padStart(2, "0");
  const today = berlinDateString(date);
  const startUtc = new Date(`${today}T00:00:00${sign}${hh}:${mm}`);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() };
}

async function geocode(strasse: string, plz: string, stadt: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = Deno.env.get("ORS_API_KEY");
  if (!apiKey) return null;
  const text = [strasse, plz, stadt, "Deutschland"].filter(Boolean).join(", ").trim();
  if (!text) return null;
  try {
    const url = new URL("https://api.openrouteservice.org/geocode/search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("text", text);
    url.searchParams.set("size", "1");
    url.searchParams.set("boundary.country", "DEU");
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;
    const [lng, lat] = feature.geometry.coordinates;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    return { lat, lng };
  } catch (e) {
    console.error("pickup geocode failed", e);
    return null;
  }
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
    let bypassDeadline = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.weekday === "number") forceWeekday = body.weekday;
        if (body?.dryRun === true) dryRun = true;
        if (body?.bypassDeadline === true) bypassDeadline = true;
      } catch {
        // ignore
      }
    }

    // Deadline-Gate: nur ausführen, wenn Berliner Zeit == eingestellte Deadline
    if (!bypassDeadline) {
      const { data: settings } = await supabase
        .from("pickup_cron_settings")
        .select("deadline_hour, deadline_minute")
        .eq("id", 1)
        .single();
      const deadlineHour = settings?.deadline_hour ?? 14;
      const deadlineMinute = settings?.deadline_minute ?? 0;
      const { hour, minute } = berlinHourMinute();
      if (hour !== deadlineHour || minute !== deadlineMinute) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "deadline_not_reached", berlin: { hour, minute }, deadline: { hour: deadlineHour, minute: deadlineMinute } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
    }

    const weekday = forceWeekday ?? isoWeekdayBerlin();
    const today = berlinDateString();
    const { startUtc, endUtc } = berlinDayRangeUtc();

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
      // Nur Abholung erstellen, wenn der Händler heute (Berlin) auch eine reguläre Bestellung erstellt hat
      const { data: todaysOrders, error: ordErr } = await supabase
        .from("orders")
        .select("id")
        .eq("user_id", m.user_id)
        .eq("is_pickup", false)
        .gte("created_at", startUtc)
        .lt("created_at", endUtc)
        .limit(1);

      if (ordErr) {
        results.push({ merchant: m.firma_name ?? m.id, status: "error", reason: ordErr.message });
        continue;
      }

      if (!todaysOrders || todaysOrders.length === 0) {
        results.push({ merchant: m.firma_name ?? m.id, status: "skipped_no_orders" });
        continue;
      }

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

      const geo = await geocode(m.strasse, m.plz, m.stadt);

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
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          geocoded_at: geo ? new Date().toISOString() : null,
        })
        .select("id")
        .single();

      if (insErr) {
        results.push({ merchant: m.firma_name ?? m.id, status: "error", reason: insErr.message });
      } else {
        results.push({
          merchant: m.firma_name ?? m.id,
          status: geo ? "created" : "created_no_geo",
          orderId: inserted.id,
        });
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